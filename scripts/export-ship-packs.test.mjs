import { describe, it, expect } from 'vitest';

import {
  SHIPS,
  SPEC_VERSION,
  aliasesFor,
  buildPack,
  cabinMetaFor,
  classifyFeature,
  computeExtent,
  indexEntryFor,
  reconcileIndexTimestamp,
  reconcilePackTimestamp,
  revisionOf,
} from './export-ship-packs.mjs';

const xcel = () => buildPack(SHIPS[0].metadata, SHIPS[0].decks);

describe('classifyFeature', () => {
  it('reads vertical circulation out of the tags, not the category', () => {
    // Elevator cores are authored as category "Guest Services" like the shore-
    // excursion desk; only the tags distinguish them.
    expect(
      classifyFeature({ name: 'Forward Elevator Bank A', category: 'Guest Services', tags: ['Elevator', 'Stairs'] })
    ).toBe('elevator');
  });

  it('prefers elevator over stairwell when a core is tagged with both', () => {
    expect(classifyFeature({ name: 'Midship Core', tags: ['Stairs', 'Elevator'] })).toBe('elevator');
    expect(classifyFeature({ name: 'Aft Stairwell', tags: ['Stairs'] })).toBe('stairwell');
  });

  it('classifies staterooms and suites as cabins', () => {
    expect(classifyFeature({ name: 'Stateroom 10101', category: 'Staterooms' })).toBe('cabin');
    expect(classifyFeature({ name: 'Suite 12101', category: 'Suites' })).toBe('cabin');
  });

  it('emits crew and back-of-house space as corridor so consumers draw but never list it', () => {
    expect(classifyFeature({ name: 'Crew Service Area', category: 'Crew & Service', hideLabel: true })).toBe('corridor');
    expect(classifyFeature({ name: 'Galley', category: 'Crew & Service', tags: ['Crew Only'] })).toBe('corridor');
    expect(classifyFeature({ name: 'Crew & Technical Areas' })).toBe('corridor');
    expect(classifyFeature({ name: 'Provision Stores' })).toBe('corridor');
    expect(classifyFeature({ name: 'Decorative strip', category: 'Pool & Sun Deck', hideLabel: true })).toBe('corridor');
  });

  it('falls back to venue for everything else', () => {
    expect(classifyFeature({ name: 'Luminae Restaurant', category: 'Fine Dining' })).toBe('venue');
    expect(classifyFeature({ name: 'Celebrity Flagship Store', category: 'Shopping & Galleries' })).toBe('venue');
    expect(classifyFeature({ name: 'Unlabelled space' })).toBe('venue');
  });
});

describe('cabinMetaFor', () => {
  it('pulls the cabin number out of the name and keeps the side', () => {
    expect(
      cabinMetaFor({ name: 'Stateroom 10101 (Infinite Veranda)', category: 'Staterooms', side: 'Port', ada: true, sqft: 243 })
    ).toMatchObject({ number: '10101', side: 'port', accessible: true, sqft: 243, type: 'stateroom' });
  });

  it('drops an unknown side rather than guessing one', () => {
    expect(cabinMetaFor({ name: 'Suite 12101', category: 'Suites' }).side).toBeUndefined();
  });
});

describe('computeExtent', () => {
  it('spans every deck so all decks share one coordinate space', () => {
    const decks = [
      { shapeCoordinates: [[0, 0], [10, 0], [10, 10]], venues: [] },
      { shapeCoordinates: [[5, 5], [50, 5], [50, 40]], venues: [] },
    ];
    expect(computeExtent(decks)).toEqual({ minX: 0, minY: 0, maxX: 50, maxY: 40 });
  });

  it('includes venue bounds that stick out past the hull outline', () => {
    const decks = [
      { shapeCoordinates: [[0, 0], [10, 10]], venues: [{ bounds: [[-5, 0], [20, 30]], center: [7, 15] }] },
    ];
    expect(computeExtent(decks)).toMatchObject({ minX: -5, maxX: 20, maxY: 30 });
  });

  it('refuses a degenerate extent instead of emitting an unnormalizable pack', () => {
    expect(() => computeExtent([{ shapeCoordinates: [[3, 3], [3, 3]], venues: [] }])).toThrow(/degenerate/);
  });
});

describe('aliasesFor', () => {
  it('offers the line-stripped short name cruise events actually use', () => {
    expect(aliasesFor('Celebrity Xcel', 'Celebrity Cruises')).toEqual(['Xcel']);
  });

  it('adds nothing when the name does not carry the line', () => {
    expect(aliasesFor('Queen Mary 2', 'Cunard')).toEqual([]);
  });
});

describe('revisionOf', () => {
  it('ignores updatedAt so an unchanged re-export keeps its revision', () => {
    const a = xcel();
    const b = xcel();
    expect(b.updatedAt).toBeDefined();
    expect(revisionOf(b)).toBe(revisionOf(a));
  });

  it('changes when deck content changes', () => {
    const pack = xcel();
    const edited = { ...pack, decks: pack.decks.slice(0, 3) };
    expect(revisionOf(edited)).not.toBe(revisionOf(pack));
  });
});

describe('timestamp reconciliation', () => {
  it('keeps the previous updatedAt when the revision is unchanged', () => {
    // Otherwise every `npm run build` rewrites the committed pack with nothing
    // but a new timestamp, churning a 188 KB diff.
    const pack = xcel();
    const previous = { revision: pack.revision, updatedAt: '2020-01-01T00:00:00.000Z' };
    expect(reconcilePackTimestamp(pack, previous).updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('takes the new timestamp when content actually changed', () => {
    const pack = xcel();
    const previous = { revision: 'stale0000000', updatedAt: '2020-01-01T00:00:00.000Z' };
    expect(reconcilePackTimestamp(pack, previous).updatedAt).toBe(pack.updatedAt);
  });

  it('stamps a fresh timestamp on a first export', () => {
    const pack = xcel();
    expect(reconcilePackTimestamp(pack, null).updatedAt).toBe(pack.updatedAt);
  });

  it('holds the catalog generatedAt steady when the ship rows are identical', () => {
    const index = { specVersion: 1, generatedAt: 'now', ships: [{ shipId: 'a' }] };
    const previous = { specVersion: 1, generatedAt: 'then', ships: [{ shipId: 'a' }] };
    expect(reconcileIndexTimestamp(index, previous).generatedAt).toBe('then');
  });

  it('refreshes the catalog generatedAt when a ship row changes', () => {
    const index = { specVersion: 1, generatedAt: 'now', ships: [{ shipId: 'a', revision: 'x' }] };
    const previous = { specVersion: 1, generatedAt: 'then', ships: [{ shipId: 'a', revision: 'y' }] };
    expect(reconcileIndexTimestamp(index, previous).generatedAt).toBe('now');
  });
});

describe('the published Celebrity Xcel pack', () => {
  const pack = xcel();

  it('declares the spec version consumers check', () => {
    // `units: "meters"` was additive, so v1 still describes this pack.
    expect(pack.specVersion).toBe(SPEC_VERSION);
    expect(SPEC_VERSION).toBe(1);
  });

  it('declares metre units and keeps extent as the normalizer', () => {
    expect(pack.geometry.units).toBe('meters');
    const { minX, maxX } = pack.geometry.extent;
    expect(maxX - minX).toBeCloseTo(pack.geometry.lengthMeters, 0);
  });

  it('lists no crew, service, technical or stores space as a venue', () => {
    // AuraTrip puts every `venue` in guest search, so a leak here shows guests
    // "Crew Service Area" results.
    const byId = new Map(SHIPS[0].decks.flatMap((d) => d.venues).map((v) => [v.id, v]));
    const venues = pack.decks.flatMap((d) => d.features.filter((f) => f.featureType === 'venue'));
    const leaks = venues.filter(
      (f) =>
        byId.get(f.id)?.hideLabel ||
        /crew|service area|technical|provision stores/i.test(`${f.category} ${f.name}`)
    );
    expect(leaks.map((f) => `${f.id} ${f.name}`)).toEqual([]);
  });

  it('still draws crew strips, as corridor', () => {
    const crew = pack.decks.flatMap((d) => d.features.filter((f) => f.category === 'Crew & Service'));
    expect(crew.length).toBeGreaterThan(0);
    expect(new Set(crew.map((f) => f.featureType))).toEqual(new Set(['corridor']));
  });

  it('keeps real guest venues as venues', () => {
    const venueNames = pack.decks.flatMap((d) =>
      d.features.filter((f) => f.featureType === 'venue').map((f) => f.name)
    );
    expect(venueNames).toContain('Sunset Bar');
    expect(venueNames).toContain('Le Voyage by Daniel Boulud');
  });

  it('carries the provenance a consumer must display', () => {
    expect(pack.license).toBe('MIT');
    expect(pack.attribution).toMatch(/not an official deck plan/);
    expect(pack.sourceUrl).toMatch(/^https:\/\//);
  });

  it('emits decks in ascending order with unique numbers', () => {
    const numbers = pack.decks.map((d) => d.deckNumber);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('gives every feature an id, a name and usable geometry', () => {
    for (const deck of pack.decks) {
      for (const f of deck.features) {
        expect(f.id, `${deck.deckName} feature id`).toBeTruthy();
        expect(f.name, `${f.id} name`).toBeTruthy();
        expect(f.center).toHaveLength(2);
        expect(f.bounds).toHaveLength(2);
        expect(Number.isFinite(f.center[0]) && Number.isFinite(f.center[1])).toBe(true);
      }
    }
  });

  it('keeps every coordinate inside the declared extent', () => {
    // Consumers normalize against `extent` and clamp; a point outside it would
    // silently pile up on the hull edge rather than error, so assert it here.
    const { minX, minY, maxX, maxY } = pack.geometry.extent;
    const inside = ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY;
    for (const deck of pack.decks) {
      for (const p of deck.outline ?? []) expect(inside(p), `${deck.deckName} outline`).toBe(true);
      for (const f of deck.features) {
        expect(inside(f.center), `${f.id} center`).toBe(true);
        for (const p of f.bounds) expect(inside(p), `${f.id} bounds`).toBe(true);
      }
    }
  });

  it('numbers every cabin it publishes, so cabin lookup can resolve', () => {
    const cabins = pack.decks.flatMap((d) => d.features.filter((f) => f.featureType === 'cabin'));
    expect(cabins.length).toBeGreaterThan(0);
    expect(cabins.every((c) => !!c.cabin?.number)).toBe(true);
  });
});

describe('indexEntryFor', () => {
  it('summarizes the pack without duplicating its geometry', () => {
    const entry = indexEntryFor(xcel());
    expect(entry).toMatchObject({
      shipId: 'celebrity-xcel',
      shipName: 'Celebrity Xcel',
      aliases: ['Xcel'],
      path: 'v1/ships/celebrity-xcel/plan.json',
    });
    expect(entry.deckCount).toBeGreaterThan(0);
    expect(JSON.stringify(entry)).not.toMatch(/features/);
  });
});
