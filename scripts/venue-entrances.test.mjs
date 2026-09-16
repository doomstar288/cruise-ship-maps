import { describe, it, expect } from 'vitest';

import { SHIPS, SPEC_VERSION, buildPack } from './export-ship-packs.mjs';
import {
  ENTRANCE_INCLUDE_IDS,
  ENTRANCE_OVERRIDES,
  HULL_CLEARANCE_M,
  LONG_CORRIDOR_M,
  MIN_PASSAGE_M,
  deriveEntrances,
  distanceToRing,
  insidePolygon,
  isCirculation,
  isLargeVenue,
  withEntrances,
} from './venue-entrances.mjs';

const rect = (id, [x1, y1], [x2, y2], extra = {}) => ({
  id,
  name: id,
  featureType: 'venue',
  bounds: [
    [x1, y1],
    [x2, y2],
  ],
  center: [(x1 + x2) / 2, (y1 + y2) / 2],
  ...extra,
});

/** A 100 × 40 box of a deck. */
const OUTLINE = [
  [0, 0],
  [100, 0],
  [100, 40],
  [0, 40],
  [0, 0],
];

describe('deriveEntrances', () => {
  it('puts doors on the edge facing a cross-passage, never on the hull sides', () => {
    // Hall fills the beam (0.4 m hull margin) with a 2 m passage to its neighbour.
    const hall = rect('hall', [10, 0.4], [40, 39.6]);
    const shop = rect('shop', [42, 0.4], [60, 39.6]);
    const doors = deriveEntrances(hall, [hall, shop], OUTLINE);
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every(([x]) => x === 40)).toBe(true);
  });

  it('treats a sub-metre seam as a shared wall, not a passage', () => {
    const port = rect('port', [10, 0.4], [40, 19.8]);
    const stbd = rect('stbd', [10, 20.2], [40, 39.6]);
    const bow = rect('bow', [0.4, 0.4], [9.8, 39.6]);
    const aft = rect('aft', [40.3, 0.4], [99.6, 39.6]);
    expect(deriveEntrances(port, [port, stbd, bow, aft], OUTLINE)).toEqual([]);
  });

  it('opens straight onto an atrium it borders', () => {
    const bistro = rect('bistro', [10, 0.4], [40, 11.5]);
    const plaza = rect('plaza', [10, 12], [40, 27], { tags: ['Atrium'] });
    const cafe = rect('cafe', [10, 27.5], [40, 39.6]);
    const bow = rect('bow', [0.4, 0.4], [9.8, 39.6]);
    const aft = rect('aft', [40.3, 0.4], [99.6, 39.6]);
    const doors = deriveEntrances(bistro, [bistro, plaza, cafe, bow, aft], OUTLINE);
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every(([, y]) => y === 11.5)).toBe(true);
  });

  it('gives a long open side two doors and a short one a single door', () => {
    const long = rect('long', [10, 0.4], [40, 39.6]);
    const lobby = rect('lobby', [42, 10], [54, 30], { featureType: 'elevator' });
    const beyond = rect('beyond', [56, 0.4], [99.6, 39.6]);
    // The lobby face (20 m) and the passage beside it (to `beyond`) make one open run.
    expect(deriveEntrances(long, [long, lobby, beyond], OUTLINE)).toHaveLength(2);

    const short = rect('short', [10, 15], [40, 25]);
    const doors = deriveEntrances(short, [short, rect('n', [42, 15], [60, 25])], OUTLINE);
    expect(doors).toEqual([[40, 20]]);
  });
});

describe('large-venue rule', () => {
  it('covers big venues and the include list, never circulation or non-venues', () => {
    expect(isLargeVenue(rect('big', [0, 0], [40, 20]))).toBe(true);
    expect(isLargeVenue(rect('small', [0, 0], [10, 10]))).toBe(false);
    expect(isLargeVenue(rect('v4-cyprus', [0, 0], [10, 10]))).toBe(true);
    expect(isLargeVenue(rect('atrium', [0, 0], [40, 40], { tags: ['Atrium'] }))).toBe(false);
    expect(isLargeVenue(rect('crew', [0, 0], [40, 40], { featureType: 'corridor' }))).toBe(false);
  });

  it('omits the key when no entrance can be derived', () => {
    const [boxed] = withEntrances([rect('boxed', [0.4, 0.4], [99.6, 39.6])], OUTLINE);
    expect(boxed).not.toHaveProperty('entrances');
  });
});

describe('entrances in the published Celebrity Xcel pack', () => {
  const pack = buildPack(SHIPS[0].metadata, SHIPS[0].decks);
  const withDeck = pack.decks.flatMap((deck) => deck.features.map((f) => ({ deck, f })));
  const entranced = withDeck.filter(({ f }) => f.entrances);

  const rectOf = ({ bounds: [[x1, y1], [x2, y2]] }) => ({ x1, y1, x2, y2 });
  const strictlyInside = ([x, y], r, tol = 0.05) =>
    x > r.x1 + tol && x < r.x2 - tol && y > r.y1 + tol && y < r.y2 - tol;
  const near = ([x, y], r, tol) =>
    x >= r.x1 - tol && x <= r.x2 + tol && y >= r.y1 - tol && y <= r.y2 + tol;

  /** Outward normal of the rectangle edge `p` sits on, or null if it is not on one. */
  function edgeNormal([x, y], r, tol = 0.01) {
    const onX = y >= r.y1 - tol && y <= r.y2 + tol;
    const onY = x >= r.x1 - tol && x <= r.x2 + tol;
    if (onX && Math.abs(x - r.x1) <= tol) return [-1, 0];
    if (onX && Math.abs(x - r.x2) <= tol) return [1, 0];
    if (onY && Math.abs(y - r.y1) <= tol) return [0, -1];
    if (onY && Math.abs(y - r.y2) <= tol) return [0, 1];
    return null;
  }

  it('is still spec version 1', () => {
    expect(pack.specVersion).toBe(1);
    expect(SPEC_VERSION).toBe(1);
  });

  it('gives every listed large venue at least one entrance', () => {
    const byId = new Map(withDeck.map(({ f }) => [f.id, f]));
    for (const id of ENTRANCE_INCLUDE_IDS) {
      expect(byId.get(id), `${id} exists in the pack`).toBeDefined();
      expect(byId.get(id).entrances?.length ?? 0, `${id} entrances`).toBeGreaterThanOrEqual(1);
    }
    for (const { f } of withDeck.filter(({ f }) => isLargeVenue(f))) {
      expect(f.entrances?.length ?? 0, `${f.id} entrances`).toBeGreaterThanOrEqual(1);
    }
  });

  it('puts entrances only on large venues, and never on the Grand Plaza atrium', () => {
    for (const { f } of entranced) expect(isLargeVenue(f), f.id).toBe(true);
    const plaza = withDeck.filter(({ f }) => /^Grand Plaza( \(|$)/.test(f.name));
    expect(plaza).toHaveLength(3);
    for (const { f } of plaza) expect(f.entrances, f.id).toBeUndefined();
  });

  it('places every entrance on its venue boundary, rounded like the rest of the pack', () => {
    for (const { f } of entranced) {
      for (const p of f.entrances) {
        expect(edgeNormal(p, rectOf(f)), `${f.id} ${p}`).not.toBeNull();
        expect(
          p.every((n) => Math.round(n * 100) / 100 === n),
          `${f.id} ${p} rounding`
        ).toBe(true);
      }
    }
  });

  it('opens every entrance onto walkable circulation, not the hull or a neighbour', () => {
    // On public decks the walkways are the free passages between rectangles
    // (cross-passages beside each elevator core, stateroom corridors) plus the
    // elevator lobbies and atrium. Stepping out through the door must land in
    // one of those, inside the hull, for the width of a real passage.
    for (const { deck, f } of entranced) {
      const others = deck.features.filter((o) => o !== f);
      for (const p of f.entrances) {
        const [nx, ny] = edgeNormal(p, rectOf(f));
        expect(distanceToRing(p, deck.outline), `${f.id} ${p} off the hull`).toBeGreaterThanOrEqual(
          HULL_CLEARANCE_M
        );
        for (const step of [0.5, 1, MIN_PASSAGE_M - 0.1]) {
          const q = [p[0] + nx * step, p[1] + ny * step];
          expect(insidePolygon(q, deck.outline), `${f.id} ${p} +${step} m inside hull`).toBe(true);
          const blocking = others.filter((o) => !isCirculation(o) && strictlyInside(q, rectOf(o)));
          expect(
            blocking.map((o) => o.id),
            `${f.id} ${p} +${step} m walkable`
          ).toEqual([]);
        }
        // Keep walking: a passage ends at another feature (or runs the length of
        // a corridor). Reaching the hull first means the door faces hull-side deck.
        let endsAt = 'corridor';
        for (let s = 0.1; s < LONG_CORRIDOR_M; s += 0.1) {
          const q = [p[0] + nx * s, p[1] + ny * s];
          if (others.some((o) => strictlyInside(q, rectOf(o), 0))) {
            endsAt = 'feature';
            break;
          }
          if (!insidePolygon(q, deck.outline)) {
            endsAt = 'hull';
            break;
          }
        }
        expect(endsAt, `${f.id} ${p} passage end`).not.toBe('hull');
      }
    }
  });

  it('never puts an entrance on a cabin or crew feature', () => {
    for (const { deck, f } of entranced) {
      const blocked = deck.features.filter(
        (o) => o.featureType === 'cabin' || o.featureType === 'corridor'
      );
      for (const p of f.entrances) {
        const hits = blocked.filter((o) => near(p, rectOf(o), 0.25));
        expect(
          hits.map((o) => o.id),
          `${f.id} ${p}`
        ).toEqual([]);
      }
    }
  });

  it('keeps hand-authored overrides pointed at real large venues', () => {
    const ids = new Set(withDeck.map(({ f }) => f.id));
    for (const id of Object.keys(ENTRANCE_OVERRIDES)) expect(ids.has(id), id).toBe(true);
  });
});
