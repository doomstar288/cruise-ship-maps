import { describe, it, expect } from 'vitest';
import { CELEBRITY_XCEL_DECKS, CELEBRITY_XCEL_METADATA } from './celebrityXcelData';

describe('Celebrity Xcel deck dataset', () => {
  it('generates all 17 decks with sequential levels', () => {
    expect(CELEBRITY_XCEL_DECKS).toHaveLength(CELEBRITY_XCEL_METADATA.totalDecks);
    const levels = CELEBRITY_XCEL_DECKS.map((d) => d.level);
    expect(levels).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });

  it('gives every deck a hull outline and at least one venue', () => {
    for (const deck of CELEBRITY_XCEL_DECKS) {
      expect(deck.shapeCoordinates.length).toBeGreaterThan(2);
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
});
