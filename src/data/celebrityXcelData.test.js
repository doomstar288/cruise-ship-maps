import { describe, it, expect } from 'vitest';
import { CELEBRITY_XCEL_DECKS, CELEBRITY_XCEL_METADATA } from './celebrityXcelData';
import { isValidImo } from '../utils/imo';
import { CENTERLINE_Y, SHIP_LENGTH_M, hullHalfWidth, isInsideHull } from '../utils/deckPlanDataPipeline';

const deckAt = (level) => CELEBRITY_XCEL_DECKS.find((d) => d.level === level);
const allVenues = () => CELEBRITY_XCEL_DECKS.flatMap((d) => d.venues.map((v) => ({ ...v, level: d.level })));

describe('Celebrity Xcel vessel metadata', () => {
  it('carries a checksum-valid IMO number', () => {
    expect(isValidImo(CELEBRITY_XCEL_METADATA.imoNumber)).toBe(true);
  });
});

describe('Celebrity Xcel deck dataset', () => {
  it('models the 15 guest decks, with no Deck 1 or Deck 13', () => {
    const levels = CELEBRITY_XCEL_DECKS.map((d) => d.level);
    expect(levels).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17]);
    expect(levels).toHaveLength(CELEBRITY_XCEL_METADATA.guestDecks);
  });

  it('gives every deck a closed hull outline and at least one venue', () => {
    for (const deck of CELEBRITY_XCEL_DECKS) {
      const outline = deck.shapeCoordinates;
      expect(outline.length).toBeGreaterThan(2);
      expect(outline[0]).toEqual(outline[outline.length - 1]);
      expect(deck.venues.length).toBeGreaterThan(0);
    }
  });

  it('produces well-formed venue bounds and centers', () => {
    for (const deck of CELEBRITY_XCEL_DECKS) {
      for (const venue of deck.venues) {
        expect(venue.id).toBeTruthy();
        expect(venue.name).toBeTruthy();
        expect(venue.category).toBeTruthy();

        const [[x1, y1], [x2, y2]] = venue.bounds;
        expect(x2).toBeGreaterThan(x1);
        expect(y2).toBeGreaterThan(y1);

        const [cx, cy] = venue.center;
        expect(cx).toBeGreaterThanOrEqual(x1);
        expect(cx).toBeLessThanOrEqual(x2);
        expect(cy).toBeGreaterThanOrEqual(y1);
        expect(cy).toBeLessThanOrEqual(y2);
      }
    }
  });

  it('keeps venue ids unique within a deck', () => {
    for (const deck of CELEBRITY_XCEL_DECKS) {
      const ids = deck.venues.map((v) => v.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps every venue on its deck, except platforms that hang outboard', () => {
    for (const { level, bounds, id, outboard } of allVenues()) {
      if (outboard) continue;
      const [[x1, y1], [x2, y2]] = bounds;
      for (const corner of [[x1, y1], [x1, y2], [x2, y1], [x2, y2]]) {
        expect(isInsideHull(level, corner), `${id} corner ${corner} on Deck ${level}`).toBe(true);
      }
    }
  });

  it('never lets two venues partially overlap (nesting is allowed)', () => {
    const overlaps = (a, b) =>
      a[0][0] < b[1][0] && b[0][0] < a[1][0] && a[0][1] < b[1][1] && b[0][1] < a[1][1];
    const contains = (a, b) =>
      a[0][0] <= b[0][0] && a[0][1] <= b[0][1] && a[1][0] >= b[1][0] && a[1][1] >= b[1][1];
    for (const deck of CELEBRITY_XCEL_DECKS) {
      const venues = deck.venues;
      for (let i = 0; i < venues.length; i += 1) {
        for (let j = i + 1; j < venues.length; j += 1) {
          const a = venues[i].bounds;
          const b = venues[j].bounds;
          if (!overlaps(a, b)) continue;
          expect(
            contains(a, b) || contains(b, a),
            `${venues[i].id} and ${venues[j].id} overlap on Deck ${deck.level}`
          ).toBe(true);
        }
      }
    }
  });
});

describe('real-ship layout', () => {
  it('stops the Magic Carpet on Decks 2, 5, 14 and 16, cantilevered off starboard', () => {
    const stops = allVenues().filter((v) => v.category === 'Magic Carpet');
    expect(stops.map((v) => v.level)).toEqual([2, 5, 14, 16]);
    for (const stop of stops) {
      const hullEdge = CENTERLINE_Y + hullHalfWidth(stop.level, stop.center[0]);
      expect(stop.bounds[0][1]).toBeGreaterThanOrEqual(hullEdge);
    }
  });

  it('puts The Theatre forward on Decks 3–5 and The Bazaar aft on Decks 4–6', () => {
    for (const level of [3, 4, 5]) {
      const theatre = deckAt(level).venues.find((v) => v.name.startsWith('The Theatre'));
      expect(theatre.center[0]).toBeLessThan(SHIP_LENGTH_M / 3);
    }
    for (const level of [4, 5, 6]) {
      const bazaar = deckAt(level).venues.filter((v) => /Bazaar/.test(`${v.name} ${v.tags?.join(' ')}`));
      expect(bazaar.length).toBeGreaterThan(0);
      for (const v of bazaar) expect(v.center[0]).toBeGreaterThan((2 * SHIP_LENGTH_M) / 3);
    }
  });

  it('does not carry venues that Xcel does not have', () => {
    const names = allVenues().map((v) => v.name).join('\n');
    expect(names).not.toMatch(/\bEden\b/);
    expect(names).not.toMatch(/Solstice/);
  });

  it('places the Iconic Suites forward on Deck 12 and the Sunset Bar at the stern of Deck 15', () => {
    const iconic = deckAt(12).venues.filter((v) => v.cabinClass === 'IC');
    expect(iconic).toHaveLength(2);
    for (const suite of iconic) expect(suite.center[0]).toBeLessThan(50);

    const sunsetBar = deckAt(15).venues.find((v) => v.id === 'v15-sunset-bar');
    expect(sunsetBar.center[0]).toBeGreaterThan(280);
  });

  it('numbers cabins with the deck prefix, even to port and odd to starboard', () => {
    for (const deck of CELEBRITY_XCEL_DECKS) {
      const cabins = deck.venues.filter((v) => v.cabinClass);
      const numbers = cabins.map((c) => Number(c.label));
      expect(new Set(numbers).size, `Deck ${deck.level} duplicate cabin numbers`).toBe(numbers.length);
      for (const cabin of cabins) {
        expect(cabin.label.startsWith(String(deck.level))).toBe(true);
        if (cabin.cabinClass === 'EV') continue; // Edge Villas keep their published numbers.
        expect(Number(cabin.label) % 2, cabin.id).toBe(cabin.side === 'Port' ? 0 : 1);
      }
    }
  });

  it('has a realistic stateroom count on a typical cabin deck', () => {
    const count = deckAt(8).venues.filter((v) => v.cabinClass).length;
    expect(count).toBeGreaterThan(150);
    expect(count).toBeLessThan(300);
  });
});
