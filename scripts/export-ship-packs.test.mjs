import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import {
  ACCESS,
  DRESS_CODES,
  FEES,
  PACK_POSITION_CONFIDENCE_DEFAULTS,
  PORT_EXITS,
  POSITION_CONFIDENCE,
  SHIPS,
  SPEC_VERSION,
  accessFor,
  aliasesFor,
  bookingFactsFor,
  buildPack,
  cabinMetaFor,
  classifyFeature,
  computeExtent,
  featureAliasesFor,
  foldName,
  hoursFor,
  indexEntryFor,
  portExitFor,
  positionConfidenceFor,
  reconcileIndexTimestamp,
  reconcilePackTimestamp,
  revisionOf,
  spansDecksFor,
} from './export-ship-packs.mjs';
import { FILTER_KEYS, getFilterKey } from '../src/utils/venueTaxonomy.js';

const xcel = () => buildPack(SHIPS[0].metadata, SHIPS[0].decks);
// Building a pack rasterizes every deck for the routing graph (seconds under coverage),
// so tests that only read a pack share one build, made while the file is collected
// rather than inside a test's time limit. None of them mutate it.
const sharedPack = xcel();
const sharedXcel = () => sharedPack;
// The one test that needs two independent exports builds twice.
const TWO_BUILDS_TIMEOUT_MS = 60_000;

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

describe('positionConfidenceFor', () => {
  it('keeps a confidence authored on the source record', () => {
    expect(positionConfidenceFor({ id: 'v', positionConfidence: 'estimated' }, 'venue')).toBe('estimated');
    expect(positionConfidenceFor({ id: 'c', positionConfidence: 'zone' }, 'cabin')).toBe('zone');
  });

  it('defaults by feature type when the record sets none', () => {
    expect(positionConfidenceFor({}, 'venue')).toBe('zone');
    expect(positionConfidenceFor({}, 'poi')).toBe('zone');
    expect(positionConfidenceFor({}, 'muster_station')).toBe('zone');
    expect(positionConfidenceFor({}, 'elevator')).toBe('estimated');
    expect(positionConfidenceFor({}, 'stairwell')).toBe('estimated');
    expect(positionConfidenceFor({}, 'cabin')).toBe('estimated');
  });

  it('makes no claim for corridors, which are never a destination', () => {
    expect(positionConfidenceFor({ positionConfidence: 'zone' }, 'corridor')).toBeUndefined();
  });

  it('rejects a value outside the vocabulary rather than publishing it', () => {
    expect(() => positionConfidenceFor({ id: 'v', positionConfidence: 'exact' }, 'venue')).toThrow(/exact/);
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
  }, TWO_BUILDS_TIMEOUT_MS);

  it('changes when deck content changes', () => {
    const pack = sharedXcel();
    const edited = { ...pack, decks: pack.decks.slice(0, 3) };
    expect(revisionOf(edited)).not.toBe(revisionOf(pack));
  });
});

describe('timestamp reconciliation', () => {
  it('keeps the previous updatedAt when the revision is unchanged', () => {
    // Otherwise every `npm run build` rewrites the committed pack with nothing
    // but a new timestamp, churning a 188 KB diff.
    const pack = sharedXcel();
    const previous = { revision: pack.revision, updatedAt: '2020-01-01T00:00:00.000Z' };
    expect(reconcilePackTimestamp(pack, previous).updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('takes the new timestamp when content actually changed', () => {
    const pack = sharedXcel();
    const previous = { revision: 'stale0000000', updatedAt: '2020-01-01T00:00:00.000Z' };
    expect(reconcilePackTimestamp(pack, previous).updatedAt).toBe(pack.updatedAt);
  });

  it('stamps a fresh timestamp on a first export', () => {
    const pack = sharedXcel();
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
  const pack = sharedXcel();

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

describe('position confidence in the published Celebrity Xcel pack', () => {
  const pack = sharedXcel();
  const features = pack.decks.flatMap((d) => d.features);
  const byName = (name) => features.find((f) => f.name === name);
  /** How a consumer resolves it: the feature's own value, else the pack default for its type. */
  const resolved = (f) => f.positionConfidence ?? pack.positionConfidenceDefaults?.[f.featureType];

  it('stays specVersion 1, since the field is additive', () => {
    expect(pack.specVersion).toBe(1);
  });

  it('gives every guest venue an allowed confidence on the feature itself', () => {
    const guest = features.filter((f) => ['venue', 'poi', 'muster_station'].includes(f.featureType));
    expect(guest.length).toBeGreaterThan(0);
    for (const f of guest) expect(POSITION_CONFIDENCE, `${f.id}`).toContain(f.positionConfidence);
  });

  it('marks verified venues checked against the official plan in P1.1', () => {
    const verified = features.filter((f) => resolved(f) === 'verified').map((f) => f.id);
    expect(verified.length).toBeGreaterThan(0);
    expect(verified).toContain('v3-normandie');
    expect(verified).toContain('v3-tuscan');
    expect(verified).toContain('v4-cosmopolitan');
    expect(verified).toContain('v4-cyprus');
    expect(verified).toContain('v4-le-voyage');
    expect(verified).toContain('v4-casino');
    expect(verified).toContain('v5-blu');
    expect(verified).toContain('v15-sunset-bar');
  });

  it('marks the venues whose sources conflict as estimated', () => {
    for (const name of ['The Martini Bar', 'Mast Grill & Bar']) {
      expect(byName(name)?.positionConfidence, name).toBe('estimated');
    }
  });

  it('marks verified specialty dining venues as verified', () => {
    expect(byName('Le Voyage by Daniel Boulud').positionConfidence).toBe('verified');
  });

  it('resolves every cabin to estimated through the documented pack default', () => {
    // Synthetic numbering (P1.2). Published once at pack level, not on ~1,700 features.
    expect(pack.positionConfidenceDefaults).toEqual(PACK_POSITION_CONFIDENCE_DEFAULTS);
    const cabins = features.filter((f) => f.featureType === 'cabin');
    expect(cabins.length).toBeGreaterThan(0);
    expect(cabins.every((c) => resolved(c) === 'estimated')).toBe(true);
    expect(cabins.some((c) => 'positionConfidence' in c)).toBe(false);
  });

  it('marks elevators and stairwells estimated and leaves corridors without a claim', () => {
    const cores = features.filter((f) => f.featureType === 'elevator' || f.featureType === 'stairwell');
    expect(cores.length).toBeGreaterThan(0);
    expect(cores.every((f) => f.positionConfidence === 'estimated')).toBe(true);
    const corridors = features.filter((f) => f.featureType === 'corridor');
    expect(corridors.every((f) => resolved(f) === undefined)).toBe(true);
  });

  it('changes the revision when a confidence changes', () => {
    const edited = { ...pack, positionConfidenceDefaults: { cabin: 'zone' } };
    expect(revisionOf(edited)).not.toBe(revisionOf(pack));
  });
});

describe('indexEntryFor', () => {
  it('summarizes the pack without duplicating its geometry', () => {
    const entry = indexEntryFor(sharedXcel());
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

describe('featureAliasesFor', () => {
  it('drops repeats and an alias that restates the name, ignoring case', () => {
    const venue = { id: 'x', name: 'The Theatre', aliases: ['OVC', 'the  theatre', 'ovc', ' Theater '] };
    expect(featureAliasesFor(venue, 'venue')).toEqual(['OVC', 'Theater']);
  });

  it('keeps an accent-free spelling, for consumers that do not fold accents', () => {
    const venue = { id: 'x', name: 'Oceanview Café', aliases: ['Oceanview Cafe'] };
    expect(featureAliasesFor(venue, 'venue')).toEqual(['Oceanview Cafe']);
  });

  it('returns undefined rather than an empty list', () => {
    expect(featureAliasesFor({ id: 'x', name: 'The Theatre', aliases: ['the theatre'] }, 'venue')).toBeUndefined();
    expect(featureAliasesFor({ id: 'x', name: 'Casino' }, 'venue')).toBeUndefined();
  });

  it('refuses aliases on anything a guest does not search for', () => {
    for (const type of ['corridor', 'cabin', 'elevator', 'stairwell']) {
      expect(() => featureAliasesFor({ id: 'x', name: 'Galley', aliases: ['Kitchen'] }, type)).toThrow(/only venue and poi/);
    }
  });
});

describe('spansDecksFor', () => {
  it('sorts and deduplicates', () => {
    expect(spansDecksFor({ spansDecks: [16, 2, 5, 14, 5] })).toEqual([2, 5, 14, 16]);
  });

  it('returns undefined rather than an empty list', () => {
    expect(spansDecksFor({ spansDecks: [] })).toBeUndefined();
    expect(spansDecksFor({})).toBeUndefined();
  });
});

describe('accessFor', () => {
  it('keeps an access authored on a guest venue', () => {
    expect(accessFor({ id: 'v15-retreat-lounge', access: 'suite' }, 'venue')).toBe('suite');
  });

  it('returns undefined for a public venue, so the pack omits the key', () => {
    expect(accessFor({ id: 'v4-craft-social' }, 'venue')).toBeUndefined();
  });

  it('rejects a value outside the vocabulary rather than publishing it', () => {
    expect(() => accessFor({ id: 'v1', access: 'vip' }, 'venue')).toThrow(/unknown access "vip"/);
    expect(ACCESS).toEqual(['suite', 'adults', 'kids', 'paid']);
  });

  it('refuses access on anything a guest does not search for', () => {
    expect(() => accessFor({ id: 'c1', access: 'suite' }, 'cabin')).toThrow(/only venue and poi/);
  });
});

describe('venue access across the fleet', () => {
  const records = SHIPS.flatMap((s) => s.decks.flatMap((d) => d.venues ?? []));

  it('agrees with the restriction tags on every record', () => {
    // Tags are free text for display; `access` is what consumers act on, so the
    // two must never disagree.
    const TAG_ACCESS = {
      'Suite Guests Only': 'suite',
      'Adults Only': 'adults',
      Kids: 'kids',
      'Kids Club': 'kids',
      Teens: 'kids',
      Cabanas: 'paid',
    };
    const failures = [];
    for (const v of records) {
      for (const tag of v.tags ?? []) {
        const expected = TAG_ACCESS[tag];
        if (expected && v.access !== expected) failures.push(`${v.id} tagged ${tag} has access ${v.access}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('publishes exactly these restricted venues, fleet-wide', () => {
    // Blu (AquaClass) and the Concierge Lounge are left public until the pack
    // can tell those cabins apart. The SEA Thermal Suite shares a feature with
    // the walk-in Spa, so it stays public too.
    const restricted = new Set(
      records
        .filter((v) => accessFor(v, classifyFeature(v)) !== undefined)
        .map((v) => `${v.access}: ${v.name}`)
    );
    expect([...restricted].sort()).toEqual([
      'adults: Solarium',
      'adults: Solarium & Thalassotherapy Pool',
      'kids: Camp at Sea',
      'kids: The Basement',
      'kids: XClub Teen Lounge',
      'paid: Persian Garden',
      'paid: Pool Club Cabanas',
      'paid: The Alcoves',
      'suite: Luminae',
      'suite: Luminae at The Retreat',
      'suite: Retreat Lower Sundeck',
      'suite: The Retreat Bar',
      'suite: The Retreat Lounge',
      'suite: The Retreat Pool',
      'suite: The Retreat Sundeck',
    ]);
  });

  it('carries access into the published Celebrity Xcel pack, and omits it for public venues', () => {
    const published = JSON.parse(JSON.stringify(sharedXcel()));
    const withAccess = published.decks
      .flatMap((d) => d.features)
      .filter((f) => 'access' in f)
      .map((f) => [f.id, f.access]);
    expect(withAccess).toEqual([
      ['v2-basement', 'kids'],
      ['v3-camp-at-sea', 'kids'],
      ['v14-solarium', 'adults'],
      ['v14-cabanas', 'paid'],
      ['v15-retreat-lounge', 'suite'],
      ['v16-retreat-lower-sundeck', 'suite'],
      ['v16-luminae', 'suite'],
      ['v17-retreat-sundeck', 'suite'],
      ['v17-retreat-bar', 'suite'],
    ]);
  });
});

describe('portExitFor', () => {
  it('keeps a port exit authored on a guest venue', () => {
    expect(portExitFor({ id: 'v2-gangway', portExit: 'gangway' }, 'venue')).toBe('gangway');
    expect(portExitFor({ id: 'v2-magic-carpet', portExit: 'tender' }, 'venue')).toBe('tender');
  });

  it('returns undefined for anything that is not an exit, so the pack omits the key', () => {
    expect(portExitFor({ id: 'v2-destination-gateway' }, 'venue')).toBeUndefined();
  });

  it('rejects a value outside the vocabulary rather than publishing it', () => {
    expect(() => portExitFor({ id: 'v1', portExit: 'pier' }, 'venue')).toThrow(/unknown portExit "pier"/);
    expect(PORT_EXITS).toEqual(['gangway', 'tender']);
  });

  it('refuses a port exit on anything a guest does not search for', () => {
    for (const type of ['corridor', 'cabin', 'elevator', 'stairwell', 'muster_station']) {
      expect(() => portExitFor({ id: 'x', portExit: 'gangway' }, type)).toThrow(/only venue and poi/);
    }
  });
});

describe('port exits across the fleet', () => {
  const ships = SHIPS.map(({ metadata, decks }) => ({
    shipId: metadata.id,
    records: decks.flatMap((d) => d.venues ?? []),
  }));

  it('tags the gangway and the tender platform, and nothing beside them, on every ship', () => {
    // Destination Gateway, where guests wait for tenders, and Shore Excursions are
    // not exits. Millennium-class generators draw no tender exit. No public source
    // places a gangway, or the Solstice-class tender station, so those are estimated.
    const exits = Object.fromEntries(
      ships.map(({ shipId, records }) => [
        shipId,
        records
          .filter((v) => portExitFor(v, classifyFeature(v)) !== undefined)
          .map((v) => `${v.portExit}: ${v.id} (${positionConfidenceFor(v, 'venue')})`),
      ])
    );
    const EDGE = ['gangway: v2-gangway (estimated)', 'tender: v2-magic-carpet (zone)'];
    const SOLSTICE = ['gangway: v2-gangway (estimated)', 'tender: v2-tender-station (estimated)'];
    const MILLENNIUM = ['gangway: v2-gangway (estimated)'];
    expect(exits).toEqual({
      'celebrity-xcel': EDGE,
      'celebrity-ascent': EDGE,
      'celebrity-beyond': EDGE,
      'celebrity-apex': EDGE,
      'celebrity-edge': EDGE,
      'celebrity-solstice': SOLSTICE,
      'celebrity-equinox': SOLSTICE,
      'celebrity-eclipse': SOLSTICE,
      'celebrity-silhouette': SOLSTICE,
      'celebrity-reflection': SOLSTICE,
      'celebrity-millennium': MILLENNIUM,
      'celebrity-infinity': MILLENNIUM,
      'celebrity-summit': MILLENNIUM,
      'celebrity-constellation': MILLENNIUM,
    });
  });

  it('gives the port-day names to the exit alone, on every ship', () => {
    // A resolver must land these on the exit, not on a lounge or another Magic
    // Carpet stop. "Tender Pier" is left out: the pier is ashore, where the last
    // tender leaves from, so no feature on board answers to it.
    const NAMES = { gangway: ['Gangway', 'Disembarkation'], tender: ['Tender Platform'] };
    const failures = [];
    for (const { shipId, records } of ships) {
      for (const [kind, names] of Object.entries(NAMES)) {
        const expected = records.filter((v) => v.portExit === kind).map((v) => v.id);
        for (const name of names) {
          const owners = records
            .filter((v) => [v.name, ...(v.aliases ?? [])].some((n) => foldName(n) === foldName(name)))
            .map((v) => v.id);
          if (owners.join() !== expected.join()) failures.push(`${shipId} "${name}": ${owners.join() || 'none'}`);
        }
      }
      const pier = records.filter((v) => [v.name, ...(v.aliases ?? [])].some((n) => foldName(n) === 'tender pier'));
      if (pier.length) failures.push(`${shipId} "Tender Pier": ${pier.map((v) => v.id).join()}`);
    }
    expect(failures).toEqual([]);
  });

  it('carries portExit into the published Celebrity Xcel pack, and omits it elsewhere', () => {
    const published = JSON.parse(JSON.stringify(sharedXcel()));
    const exits = published.decks
      .flatMap((d) => d.features)
      .filter((f) => 'portExit' in f)
      .map((f) => [f.id, f.portExit, f.aliases]);
    expect(exits).toEqual([
      ['v2-gangway', 'gangway', ['Gangway', 'Disembarkation']],
      ['v2-magic-carpet', 'tender', ['Magic Carpet', 'Magic Carpet Bar', 'Tender Platform']],
    ]);
  });
});

describe('hoursFor', () => {
  const hours = (authored) => hoursFor({ id: 'v1', hours: authored }, 'venue');

  it('keeps the windows authored on a guest venue', () => {
    expect(hours([['07:00', '10:30'], ['18:00', '21:30']])).toEqual([['07:00', '10:30'], ['18:00', '21:30']]);
  });

  it('accepts a last window that runs past midnight', () => {
    expect(hours([['06:00', '11:00'], ['21:00', '02:00']])).toEqual([['06:00', '11:00'], ['21:00', '02:00']]);
    expect(hours([['21:00', '06:00']])).toEqual([['21:00', '06:00']]);
  });

  it('writes a close at midnight as 24:00, and all day as 00:00 to 24:00', () => {
    expect(hours([['06:30', '24:00']])).toEqual([['06:30', '24:00']]);
    expect(hours([['00:00', '24:00']])).toEqual([['00:00', '24:00']]);
  });

  it('returns undefined when the record has none, so the pack omits the key', () => {
    expect(hoursFor({ id: 'v1' }, 'venue')).toBeUndefined();
  });

  it.each([
    ['a string', '07:00-10:30', /list of \[open, close\] windows/],
    ['an empty list', [], /list of \[open, close\] windows/],
    ['a window without a close', [['07:00']], /not an \[open, close\] pair/],
    ['a window with three times', [['07:00', '10:30', '12:00']], /not an \[open, close\] pair/],
    ['an unpadded hour', [['7:00', '10:30']], /"7:00" is not an HH:MM opening time/],
    ['minute 60', [['07:60', '10:30']], /"07:60" is not an HH:MM opening time/],
    ['numbers', [[700, 1030]], /"700" is not an HH:MM opening time/],
    ['hour 25', [['07:00', '25:00']], /"25:00" is not an HH:MM closing time/],
    ['24:00 as an opening', [['24:00', '02:00']], /"24:00" is not an HH:MM opening time/],
    ['00:00 as a close', [['18:00', '00:00']], /close at midnight as "24:00"/],
    ['a window that closes as it opens', [['09:00', '09:00']], /opens and closes at 09:00/],
    ['windows out of order', [['12:00', '14:00'], ['07:00', '09:00']], /opening order/],
    ['overlapping windows', [['07:00', '10:30'], ['10:00', '14:00']], /must not overlap or touch/],
    ['touching windows', [['07:30', '10:30'], ['10:30', '14:00']], /must not overlap or touch/],
    ['an all-day window with another', [['00:00', '24:00'], ['06:00', '07:00']], /must not overlap or touch/],
    ['a past-midnight window that is not last', [['21:00', '02:00'], ['06:00', '11:00']], /only the last window/],
    ['a night that runs into the morning', [['06:00', '11:00'], ['21:00', '07:00']], /runs into the first one the next day/],
  ])('rejects %s rather than publishing it', (_label, authored, message) => {
    expect(() => hours(authored)).toThrow(message);
  });

  it('refuses hours on anything a guest does not search for', () => {
    expect(() => hoursFor({ id: 'c1', hours: [['07:00', '10:30']] }, 'cabin')).toThrow(/only venue and poi/);
  });
});

describe('bookingFactsFor', () => {
  it('keeps the facts a record authors and omits the rest', () => {
    expect(bookingFactsFor({ id: 'v1', reservationRequired: true, fee: 'surcharge', dressCode: 'smart casual' }, 'venue')).toEqual({
      reservationRequired: true,
      fee: 'surcharge',
      dressCode: 'smart casual',
    });
    expect(bookingFactsFor({ id: 'v1', reservationRequired: false }, 'venue')).toEqual({ reservationRequired: false });
    expect(bookingFactsFor({ id: 'v1' }, 'venue')).toEqual({});
  });

  it('rejects values outside the vocabulary rather than publishing them', () => {
    expect(() => bookingFactsFor({ id: 'v1', reservationRequired: 'yes' }, 'venue')).toThrow(/expected true or false/);
    expect(() => bookingFactsFor({ id: 'v1', fee: 'free' }, 'venue')).toThrow(/unknown fee "free"/);
    expect(() => bookingFactsFor({ id: 'v1', dressCode: 'formal' }, 'venue')).toThrow(/unknown dressCode "formal"/);
    expect(FEES).toEqual(['included', 'surcharge', 'a la carte']);
    expect(DRESS_CODES).toEqual(['casual', 'smart casual']);
  });

  it('refuses booking facts on anything a guest does not search for', () => {
    expect(() => bookingFactsFor({ id: 'c1', fee: 'included' }, 'corridor')).toThrow(/only venue and poi/);
  });
});

describe('hours and booking facts across the fleet', () => {
  const records = SHIPS.flatMap(({ metadata, decks }) =>
    decks.flatMap((d) => (d.venues ?? []).map((v) => ({ ship: metadata.id, ...v })))
  );
  const published = JSON.parse(JSON.stringify(sharedXcel()));
  const features = published.decks.flatMap((d) => d.features);
  const byId = (id) => features.find((f) => f.id === id);
  const FACT_KEYS = ['hours', 'reservationRequired', 'fee', 'dressCode'];

  it('validates on every record in every ship, not only the Xcel pack built here', () => {
    for (const v of records) {
      expect(() => hoursFor(v, classifyFeature(v)), v.id).not.toThrow();
      expect(() => bookingFactsFor(v, classifyFeature(v)), v.id).not.toThrow();
    }
  });

  it('gives every Celebrity Xcel dining venue hours and reservationRequired, except the one no source covers', () => {
    // Xcel's printed programs, Celebrity's pages and reviews never mention a
    // Grand Plaza Café. Celebrity's Edge FAQ lists one on Celebrity Edge only.
    const dining = features.filter(
      (f) => ['venue', 'poi'].includes(f.featureType) && getFilterKey(f) === FILTER_KEYS.DINING
    );
    expect(dining.length).toBeGreaterThan(20);
    const missing = dining.filter((f) => !f.hours || typeof f.reservationRequired !== 'boolean').map((f) => f.id);
    expect(missing).toEqual(['v3-plaza-cafe']);
  });

  it('publishes the sourced facts in the Celebrity Xcel pack, and omits them where none is sourced', () => {
    expect(byId('v3-normandie')).toMatchObject({
      hours: [['17:30', '21:00']],
      reservationRequired: false,
      fee: 'included',
      dressCode: 'smart casual',
    });
    expect(byId('v4-cosmopolitan').hours).toEqual([['07:30', '09:00'], ['12:00', '13:30'], ['17:30', '21:00']]);
    expect(byId('v15-bora')).toMatchObject({ reservationRequired: true, fee: 'surcharge' });
    expect(byId('v5-raw-on-5')).toMatchObject({ reservationRequired: false, fee: 'a la carte' });
    expect(byId('v14-il-secondo-bacio').hours).toEqual([['06:00', '01:00']]);
    expect(byId('v14-oceanview-cafe').hours).toEqual([['00:00', '24:00']]);
    for (const id of ['v3-plaza-cafe', 'v3-martini-bar', 'v3-theatre']) {
      expect(FACT_KEYS.filter((key) => key in byId(id)), id).toEqual([]);
    }
    // 21 dining venues, and the bars and other venues whose hours are sourced.
    expect(features.filter((f) => 'hours' in f)).toHaveLength(43);
  });

  it('gives no other ship any of these facts until a source for that ship or class does', () => {
    // Xcel's hours are its own programs' and must never be copied to a sister ship.
    const elsewhere = records
      .filter((v) => v.ship !== 'celebrity-xcel' && FACT_KEYS.some((key) => v[key] !== undefined))
      .map((v) => `${v.ship}: ${v.id}`);
    expect(elsewhere).toEqual([]);
  });
});

describe('aliases and spans in the Celebrity Xcel pack', () => {
  const pack = sharedXcel();
  const features = pack.decks.flatMap((d) => d.features.map((f) => ({ ...f, deck: d.deckNumber })));
  const byName = (name) => {
    const found = features.find((f) => f.name === name);
    expect(found, name).toBeDefined();
    return found;
  };
  // Levels of one multi-deck venue, from the deck records (the group is not published).
  const groupOf = new Map(SHIPS[0].decks.flatMap((d) => d.venues).map((v) => [v.id, v.venueGroup ?? v.id]));

  it('still declares spec version 1: both fields are additive', () => {
    expect(pack.specVersion).toBe(1);
  });

  it.each([
    ['The Theatre', ['The Theater', 'Theatre', 'Theater']],
    ['The Theatre (Middle Level)', ['The Theatre', 'The Theater', 'Theatre', 'Theater']],
    ['The Theatre (Upper Level)', ['The Theatre', 'The Theater', 'Theatre', 'Theater']],
    ['Oceanview Café', ['OVC', 'Oceanview Cafe', 'Buffet']],
    ['Celebrity Pool Club', ['Pool Deck', 'Resort Deck', 'Main Pool']],
    ['Le Grand Bistro', ['Le Petit Chef', 'Le Bistro']],
    ['Grand Plaza', ['Grand Plaza Bar']],
    ['Grand Plaza (Upper Level)', ['Grand Plaza', 'Grand Plaza Bar']],
    ['Magic Carpet (Pool Deck)', ['Magic Carpet', 'Magic Carpet Bar']],
    ['The Martini Bar', ['Martini Bar']],
    ['Spice Café', ['Spice Cafe']],
    ['The Bazaar (Upper Level)', ['The Bazaar']],
  ])('gives %s the names a daily program uses', (name, expected) => {
    expect(byName(name).aliases).toEqual(expect.arrayContaining(expected));
  });

  it('offers an accent-free alias for every accented guest venue name', () => {
    const accented = features.filter(
      (f) => ['venue', 'poi'].includes(f.featureType) && f.name !== f.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    expect(accented.length).toBeGreaterThan(0);
    for (const f of accented) {
      const plain = f.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      expect(f.aliases, f.name).toContain(plain);
    }
  });

  it.each([
    [['The Theatre', 'The Theatre (Middle Level)', 'The Theatre (Upper Level)'], [3, 4, 5]],
    [['Grand Plaza', 'Grand Plaza (Middle Level)', 'Grand Plaza (Upper Level)'], [3, 4, 5]],
    [['Mosaic at The Bazaar', 'Market at The Bazaar', 'Spice Café', 'The Bazaar (Upper Level)'], [4, 5, 6]],
    [['The Club', 'The Attic at The Club'], [4, 5]],
    [
      ['Magic Carpet (Tender Platform)', 'Magic Carpet (Deck 5 Dining)', 'Magic Carpet (Pool Deck)', 'Magic Carpet (Dinner on the Edge)'],
      [2, 5, 14, 16],
    ],
  ])('sets the span on every level of %j', (names, span) => {
    for (const name of names) expect(byName(name).spansDecks, name).toEqual(span);
  });

  it('keeps every alias unique to one venue across the ship', () => {
    // A resolver must never find two different venues for the same text. Only
    // levels of one multi-deck venue may share a name.
    const owners = new Map();
    const claim = (text, f) => {
      const key = foldName(text);
      const group = groupOf.get(f.id);
      owners.set(key, [...(owners.get(key) ?? []), { group, label: `${f.id} (${text})` }]);
    };
    for (const f of features) {
      claim(f.name, f);
      for (const alias of f.aliases ?? []) claim(alias, f);
    }
    const clashes = [...owners.entries()].filter(
      ([, claims]) => claims.some((c) => c.group !== claims[0].group) && claims.length > 1
    );
    // Generated cabins and crew strips legitimately repeat names ("Crew Service
    // Area", "Forward Elevators"), so only clashes involving an alias count.
    const aliasKeys = new Set(features.flatMap((f) => (f.aliases ?? []).map(foldName)));
    expect(clashes.filter(([key]) => aliasKeys.has(key)).map(([, claims]) => claims.map((c) => c.label))).toEqual([]);
  });

  it('never gives an alias to anything but a guest venue or point of interest', () => {
    const wrong = features.filter((f) => f.aliases && !['venue', 'poi'].includes(f.featureType));
    expect(wrong.map((f) => f.id)).toEqual([]);
  });

  it('lists a span that contains the feature itself and only decks in the pack', () => {
    const decks = new Set(pack.decks.map((d) => d.deckNumber));
    const spanning = features.filter((f) => f.spansDecks);
    expect(spanning.length).toBeGreaterThan(0);
    for (const f of spanning) {
      expect(f.spansDecks, f.id).toContain(f.deck);
      expect(f.spansDecks.length, f.id).toBeGreaterThan(1);
      expect(f.spansDecks, f.id).toEqual([...new Set(f.spansDecks)].sort((a, b) => a - b));
      for (const n of f.spansDecks) expect(decks.has(n), `${f.id} spans missing deck ${n}`).toBe(true);
    }
  });

  it('gives every level of a group the same span', () => {
    const spans = new Map();
    for (const f of features.filter((x) => x.spansDecks)) {
      const group = groupOf.get(f.id);
      spans.set(group, [...(spans.get(group) ?? []), JSON.stringify(f.spansDecks)]);
    }
    for (const [group, list] of spans) expect(new Set(list).size, group).toBe(1);
  });

  it('omits both keys, never emitting empty arrays, when a feature has none', () => {
    const json = JSON.stringify(pack);
    expect(json).not.toMatch(/"aliases":\[\]/);
    expect(json).not.toMatch(/"spansDecks":\[\]/);
    const casino = byName('Casino');
    expect('aliases' in JSON.parse(JSON.stringify(casino))).toBe(false);
    expect('spansDecks' in JSON.parse(JSON.stringify(casino))).toBe(false);
  });
});

describe('Multi-ship fleet publishing', () => {
  it('publishes all 14 Celebrity fleet ships in SHIPS array', () => {
    expect(SHIPS).toHaveLength(14);
    const ids = SHIPS.map((s) => s.metadata.id);
    expect(ids).toEqual([
      'celebrity-xcel',
      'celebrity-ascent',
      'celebrity-beyond',
      'celebrity-apex',
      'celebrity-edge',
      'celebrity-solstice',
      'celebrity-equinox',
      'celebrity-eclipse',
      'celebrity-silhouette',
      'celebrity-reflection',
      'celebrity-millennium',
      'celebrity-infinity',
      'celebrity-summit',
      'celebrity-constellation',
    ]);
  });

  it('keeps Celebrity Xcel in SHIPS[0] with full fidelity', () => {
    expect(SHIPS[0].metadata.id).toBe('celebrity-xcel');
    expect(SHIPS[0].decks).toHaveLength(15);
  });

  it('generates correct deck counts across all classes', () => {
    const deckCounts = Object.fromEntries(SHIPS.map((s) => [s.metadata.id, s.decks.length]));
    expect(deckCounts).toEqual({
      'celebrity-xcel': 15,
      'celebrity-ascent': 15,
      'celebrity-beyond': 15,
      'celebrity-apex': 14,
      'celebrity-edge': 14,
      'celebrity-solstice': 14,
      'celebrity-equinox': 14,
      'celebrity-eclipse': 14,
      'celebrity-silhouette': 14,
      'celebrity-reflection': 14,
      'celebrity-millennium': 11,
      'celebrity-infinity': 11,
      'celebrity-summit': 11,
      'celebrity-constellation': 11,
    });
  });

  it('builds valid index entries for all ships', () => {
    const entries = SHIPS.map((s) =>
      indexEntryFor({
        shipId: s.metadata.id,
        shipName: s.metadata.name,
        cruiseLine: s.metadata.cruiseLine,
        imoNumber: s.metadata.imoNumber,
        decks: s.decks,
        revision: 'dummy-rev',
        updatedAt: '2026-09-17T00:00:00Z',
      })
    );
    expect(entries).toHaveLength(14);
    for (const entry of entries) {
      expect(entry.shipId).toBeTruthy();
      expect(entry.path).toBe(`v1/ships/${entry.shipId}/plan.json`);
      expect(entry.deckCount).toBeGreaterThanOrEqual(11);
      expect(entry.aliases.length).toBeGreaterThan(0);
    }
  });

  it('produces valid catalog in public/v1/ships/index.json', () => {
    const index = JSON.parse(readFileSync('public/v1/ships/index.json', 'utf8'));
    expect(index.ships).toHaveLength(14);
    expect(index.ships.map((s) => s.shipId)).toEqual([
      'celebrity-xcel',
      'celebrity-ascent',
      'celebrity-beyond',
      'celebrity-apex',
      'celebrity-edge',
      'celebrity-solstice',
      'celebrity-equinox',
      'celebrity-eclipse',
      'celebrity-silhouette',
      'celebrity-reflection',
      'celebrity-millennium',
      'celebrity-infinity',
      'celebrity-summit',
      'celebrity-constellation',
    ]);
  });
});
