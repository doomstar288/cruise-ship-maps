import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateManifest,
  assertValidManifest,
  ingestDeckFacts,
  loadFleetRegistryData,
  findVesselInRegistry,
  parseArgs,
  EDGE_CLASS_FACTS,
} from './ingest-deck-facts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const REGISTRY_PATH = resolve(REPO_ROOT, 'public/data/fleet-registry.json');

describe('Manifest Schema Validation (validateManifest & assertValidManifest)', () => {
  const minimalValidManifest = {
    shipId: 'test-ship',
    name: 'Test Ship',
    cruiseLine: 'Test Cruise Line',
    shipClass: 'Test Class',
    imoNumber: '9884136', // Valid check digit
    deckRange: { min: 2, max: 10 },
    deckNames: {
      2: 'Deck 2',
      3: 'Deck 3',
      10: 'Deck 10',
    },
    cabinRanges: {
      3: {
        port: [{ x: [50, 100], from: 3100, to: 3150 }],
        starboard: [{ x: [50, 100], from: 3101, to: 3151 }],
      },
    },
    venues: [
      {
        name: 'Main Lounge',
        deck: 3,
        category: 'Bars & Lounges',
        zone: 'mid',
        side: 'port',
        aliases: ['Lounge'],
        confidence: 'zone',
      },
    ],
  };

  it('passes a well-formed manifest with 0 errors', () => {
    const result = validateManifest(minimalValidManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(() => assertValidManifest(minimalValidManifest)).not.toThrow();
  });

  it('rejects non-object manifests', () => {
    expect(validateManifest(null).valid).toBe(false);
    expect(validateManifest(undefined).valid).toBe(false);
    expect(validateManifest('string').valid).toBe(false);
    expect(validateManifest([1, 2, 3]).valid).toBe(false);
  });

  it('validates shipId format (must be kebab-case slug)', () => {
    expect(validateManifest({ ...minimalValidManifest, shipId: '' }).valid).toBe(false);
    expect(validateManifest({ ...minimalValidManifest, shipId: 'Test Ship' }).valid).toBe(false);
    expect(validateManifest({ ...minimalValidManifest, shipId: 'test_ship' }).valid).toBe(false);
    expect(validateManifest({ ...minimalValidManifest, shipId: 'test-ship-123' }).valid).toBe(true);
  });

  it('validates required top-level string fields', () => {
    expect(validateManifest({ ...minimalValidManifest, name: '' }).valid).toBe(false);
    expect(validateManifest({ ...minimalValidManifest, cruiseLine: '' }).valid).toBe(false);
    expect(validateManifest({ ...minimalValidManifest, shipClass: '' }).valid).toBe(false);
  });

  it('validates IMO number check digit', () => {
    // Valid IMO 9884136
    expect(validateManifest({ ...minimalValidManifest, imoNumber: '9884136' }).valid).toBe(true);
    // Invalid check digit (last digit 7 instead of 6)
    const badImoResult = validateManifest({ ...minimalValidManifest, imoNumber: '9884137' });
    expect(badImoResult.valid).toBe(false);
    expect(badImoResult.errors.some((e) => e.includes('Invalid imoNumber'))).toBe(true);
    // Invalid length
    expect(validateManifest({ ...minimalValidManifest, imoNumber: '988413' }).valid).toBe(false);
    expect(validateManifest({ ...minimalValidManifest, imoNumber: 'invalid' }).valid).toBe(false);
  });

  it('validates deckRange structure and values', () => {
    expect(validateManifest({ ...minimalValidManifest, deckRange: null }).valid).toBe(false);
    expect(
      validateManifest({ ...minimalValidManifest, deckRange: { min: 10, max: 2 } }).valid
    ).toBe(false);
    expect(
      validateManifest({ ...minimalValidManifest, deckRange: { min: -1, max: 10 } }).valid
    ).toBe(false);
    expect(
      validateManifest({ ...minimalValidManifest, deckRange: { min: 2.5, max: 10 } }).valid
    ).toBe(false);
  });

  it('validates deckNames mapping', () => {
    expect(validateManifest({ ...minimalValidManifest, deckNames: {} }).valid).toBe(false);
    expect(validateManifest({ ...minimalValidManifest, deckNames: { 15: 'Deck 15' } }).valid).toBe(
      false
    ); // Outside min:2, max:10
    expect(validateManifest({ ...minimalValidManifest, deckNames: { 3: '' } }).valid).toBe(false);
    expect(
      validateManifest({ ...minimalValidManifest, deckNames: { invalid: 'Name' } }).valid
    ).toBe(false);
  });

  it('validates cabinRanges structure', () => {
    // Invalid deck number
    expect(
      validateManifest({
        ...minimalValidManifest,
        cabinRanges: { 15: { port: [], starboard: [] } },
      }).valid
    ).toBe(false);

    // Missing starboard array
    expect(
      validateManifest({
        ...minimalValidManifest,
        cabinRanges: { 3: { port: [] } },
      }).valid
    ).toBe(false);

    // Invalid x interval (x[0] >= x[1])
    expect(
      validateManifest({
        ...minimalValidManifest,
        cabinRanges: {
          3: {
            port: [{ x: [100, 50], from: 3100, to: 3150 }],
            starboard: [],
          },
        },
      }).valid
    ).toBe(false);

    // Invalid from/to (from > to)
    expect(
      validateManifest({
        ...minimalValidManifest,
        cabinRanges: {
          3: {
            port: [{ x: [50, 100], from: 3150, to: 3100 }],
            starboard: [],
          },
        },
      }).valid
    ).toBe(false);
  });

  it('validates venues list and individual venue fields', () => {
    // Empty venues array
    expect(validateManifest({ ...minimalValidManifest, venues: [] }).valid).toBe(false);

    // Missing category
    expect(
      validateManifest({
        ...minimalValidManifest,
        venues: [{ name: 'V', deck: 3, zone: 'mid' }],
      }).valid
    ).toBe(false);

    // Deck outside deckRange
    expect(
      validateManifest({
        ...minimalValidManifest,
        venues: [{ name: 'V', deck: 15, category: 'Bar', zone: 'mid' }],
      }).valid
    ).toBe(false);

    // Invalid zone (must be fwd, mid, aft)
    expect(
      validateManifest({
        ...minimalValidManifest,
        venues: [{ name: 'V', deck: 3, category: 'Bar', zone: 'top' }],
      }).valid
    ).toBe(false);

    // Invalid side (must be port, starboard, center)
    expect(
      validateManifest({
        ...minimalValidManifest,
        venues: [{ name: 'V', deck: 3, category: 'Bar', zone: 'mid', side: 'outside' }],
      }).valid
    ).toBe(false);

    // Invalid confidence (must be verified, zone, estimated)
    expect(
      validateManifest({
        ...minimalValidManifest,
        venues: [{ name: 'V', deck: 3, category: 'Bar', zone: 'mid', confidence: 'guessed' }],
      }).valid
    ).toBe(false);
  });

  it('validates optional dimensions when provided', () => {
    expect(validateManifest({ ...minimalValidManifest, lengthMeters: 327 }).valid).toBe(true);
    expect(validateManifest({ ...minimalValidManifest, lengthMeters: -5 }).valid).toBe(false);
    expect(validateManifest({ ...minimalValidManifest, beamMeters: 0 }).valid).toBe(false);
    expect(validateManifest({ ...minimalValidManifest, grossTonnage: -100 }).valid).toBe(false);
  });

  it('assertValidManifest throws descriptive error when invalid', () => {
    expect(() => assertValidManifest({ shipId: 'bad' })).toThrow(/Manifest validation failed/);
  });
});

describe('Fleet Registry Integration & Lookup', () => {
  it('loads fleet-registry.json and finds Edge-class vessels', async () => {
    const registry = await loadFleetRegistryData(REGISTRY_PATH);
    expect(registry).toBeDefined();
    expect(Array.isArray(registry.ships)).toBe(true);

    const xcel = findVesselInRegistry(registry, 'celebrity-xcel');
    expect(xcel).not.toBeNull();
    expect(xcel.name).toBe('Celebrity Xcel');
    expect(xcel.imo).toBe('9884136');

    const beyond = findVesselInRegistry(registry, '9838395');
    expect(beyond).not.toBeNull();
    expect(beyond.name).toBe('Celebrity Beyond');

    const apex = findVesselInRegistry(registry, 'Celebrity Apex');
    expect(apex).not.toBeNull();
    expect(apex.imo).toBe('9838383');

    const edge = findVesselInRegistry(registry, 'Celebrity Edge');
    expect(edge).not.toBeNull();
    expect(edge.imo).toBe('9812705');
  });

  it('EDGE_CLASS_FACTS contains valid facts for all 5 Edge-class ships', () => {
    expect(Object.keys(EDGE_CLASS_FACTS)).toHaveLength(5);
    for (const [shipId, facts] of Object.entries(EDGE_CLASS_FACTS)) {
      expect(facts.shipId).toBe(shipId);
      const res = validateManifest(facts);
      expect(
        res.valid,
        `EDGE_CLASS_FACTS for ${shipId} should be valid: ${res.errors.join(', ')}`
      ).toBe(true);
    }
  });

  it('returns null for unknown vessels', async () => {
    const registry = await loadFleetRegistryData(REGISTRY_PATH);
    expect(findVesselInRegistry(registry, 'unknown-ship-xyz')).toBeNull();
  });
});

describe('5 Edge-Class Sister-Ship Ingestion', () => {
  const edgeShips = [
    'celebrity-xcel',
    'celebrity-ascent',
    'celebrity-beyond',
    'celebrity-apex',
    'celebrity-edge',
  ];

  it('successfully ingests and validates all 5 Edge-class ships', async () => {
    const registry = await loadFleetRegistryData(REGISTRY_PATH);

    for (const shipId of edgeShips) {
      const manifest = ingestDeckFacts({ shipId, fleetRegistry: registry });
      expect(manifest.shipId).toBe(shipId);
      const validation = validateManifest(manifest);
      expect(
        validation.valid,
        `Validation errors for ${shipId}: ${validation.errors.join(', ')}`
      ).toBe(true);
    }
  });

  it('cross-checks IMO numbers and dimensions with fleet-registry.json', async () => {
    const registry = await loadFleetRegistryData(REGISTRY_PATH);

    const expectedData = {
      'celebrity-xcel': { imo: '9884136', length: 327, guestDecks: 15, maxDeck: 17 },
      'celebrity-ascent': { imo: '9838400', length: 327, guestDecks: 15, maxDeck: 17 },
      'celebrity-beyond': { imo: '9838395', length: 327, guestDecks: 15, maxDeck: 17 },
      'celebrity-apex': { imo: '9838383', length: 306, guestDecks: 14, maxDeck: 16 },
      'celebrity-edge': { imo: '9812705', length: 306, guestDecks: 14, maxDeck: 16 },
    };

    for (const [shipId, expected] of Object.entries(expectedData)) {
      const manifest = ingestDeckFacts({ shipId, fleetRegistry: registry });
      expect(manifest.imoNumber).toBe(expected.imo);
      expect(manifest.lengthMeters).toBe(expected.length);
      expect(manifest.guestDecks).toBe(expected.guestDecks);
      expect(manifest.deckRange.max).toBe(expected.maxDeck);

      // Verify registry has matching IMO
      const vessel = findVesselInRegistry(registry, expected.imo);
      expect(vessel).not.toBeNull();
      expect(vessel.imo).toBe(expected.imo);
    }
  });

  it('verifies flagship differences across the sister ships', async () => {
    const registry = await loadFleetRegistryData(REGISTRY_PATH);

    const xcel = ingestDeckFacts({ shipId: 'celebrity-xcel', fleetRegistry: registry });
    const ascent = ingestDeckFacts({ shipId: 'celebrity-ascent', fleetRegistry: registry });
    const beyond = ingestDeckFacts({ shipId: 'celebrity-beyond', fleetRegistry: registry });
    const apex = ingestDeckFacts({ shipId: 'celebrity-apex', fleetRegistry: registry });
    const edge = ingestDeckFacts({ shipId: 'celebrity-edge', fleetRegistry: registry });

    // 1. Sunset Bar is on Deck 15 for all ships
    for (const manifest of [xcel, ascent, beyond, apex, edge]) {
      const sunsetBar = manifest.venues.find((v) => v.name === 'Sunset Bar');
      expect(sunsetBar, `Sunset Bar on ${manifest.name}`).toBeDefined();
      expect(sunsetBar.deck).toBe(15);
      expect(sunsetBar.zone).toBe('aft');
    }

    // 2. Beyond, Ascent, Xcel have stretched hull (327m) and Deck 17 (The Retreat Sundeck)
    for (const stretched of [xcel, ascent, beyond]) {
      expect(stretched.lengthMeters).toBe(327);
      expect(stretched.deckRange.max).toBe(17);
      expect(stretched.deckNames[17]).toBeDefined();
      const retreatSundeck = stretched.venues.find((v) => v.name === 'The Retreat Sundeck');
      expect(retreatSundeck).toBeDefined();
      expect(retreatSundeck.deck).toBe(17);
    }

    // 3. Edge and Apex have original length (306m) and 14 guest decks (max Deck 16, no Deck 17)
    for (const original of [edge, apex]) {
      expect(original.lengthMeters).toBe(306);
      expect(original.deckRange.max).toBe(16);
      expect(original.deckNames[17]).toBeUndefined();
      const retreatSundeck = original.venues.find((v) => v.name === 'The Retreat Sundeck');
      expect(retreatSundeck).toBeDefined();
      expect(retreatSundeck.deck).toBe(16);
    }

    // 4. Eden on Decks 4–6 on Edge, Apex, Beyond, Ascent; replaced by The Bazaar on Xcel
    for (const shipWithEden of [edge, apex, beyond, ascent]) {
      const edenVenues = shipWithEden.venues.filter((v) => v.name.includes('Eden'));
      expect(edenVenues.length, `Eden venues on ${shipWithEden.name}`).toBeGreaterThanOrEqual(3);
      const spans = edenVenues[0].spansDecks;
      expect(spans).toEqual([4, 5, 6]);

      const bazaarVenues = shipWithEden.venues.filter((v) => v.name.includes('Bazaar'));
      expect(bazaarVenues.length).toBe(0);
    }

    // Xcel has The Bazaar spanning Decks 4–6 and NO Eden
    const xcelBazaarVenues = xcel.venues.filter((v) => v.name.includes('Bazaar'));
    expect(xcelBazaarVenues.length).toBeGreaterThanOrEqual(3);
    const xcelEdenVenues = xcel.venues.filter((v) => v.name.includes('Eden'));
    expect(xcelEdenVenues.length).toBe(0);

    // 5. Le Voyage by Daniel Boulud on Beyond, Ascent, Xcel on Deck 4
    for (const shipWithVoyage of [beyond, ascent, xcel]) {
      const leVoyage = shipWithVoyage.venues.find((v) => v.name.includes('Le Voyage'));
      expect(leVoyage, `Le Voyage on ${shipWithVoyage.name}`).toBeDefined();
      expect(leVoyage.deck).toBe(4);
    }
    // Edge & Apex do not have Le Voyage
    expect(edge.venues.find((v) => v.name.includes('Le Voyage'))).toBeUndefined();
    expect(apex.venues.find((v) => v.name.includes('Le Voyage'))).toBeUndefined();

    // 6. Magic Carpet is present on all 5 ships with verified confidence and operating on 2, 5, 14, 16
    for (const manifest of [xcel, ascent, beyond, apex, edge]) {
      const magicCarpets = manifest.venues.filter((v) => v.category === 'Magic Carpet');
      expect(magicCarpets.length, `Magic Carpet stops on ${manifest.name}`).toBeGreaterThanOrEqual(
        4
      );
      const stops = magicCarpets.map((mc) => mc.deck).sort((a, b) => a - b);
      expect(stops).toEqual([2, 5, 14, 16]);
    }
  });
});

describe('Generated Manifest Files on Disk', () => {
  const ships = [
    'celebrity-xcel',
    'celebrity-ascent',
    'celebrity-beyond',
    'celebrity-apex',
    'celebrity-edge',
  ];

  it('all 5 manifest.json files exist on disk and pass validation', async () => {
    for (const shipId of ships) {
      const filePath = resolve(REPO_ROOT, `src/data/ships/${shipId}/manifest.json`);
      const content = await readFile(filePath, 'utf8');
      const manifest = JSON.parse(content);

      expect(manifest.shipId).toBe(shipId);
      const result = validateManifest(manifest);
      expect(
        result.valid,
        `Disk manifest validation errors for ${shipId}: ${result.errors.join('; ')}`
      ).toBe(true);
    }
  });
});

describe('CLI argument parser (parseArgs)', () => {
  it('parses --ship-id and flags correctly', () => {
    const args = parseArgs(['--ship-id', 'celebrity-edge', '--dry-run']);
    expect(args.shipId).toBe('celebrity-edge');
    expect(args.dryRun).toBe(true);
    expect(args.all).toBe(false);
  });

  it('parses --all and custom output', () => {
    const args = parseArgs(['--all', '--out', 'custom/dir']);
    expect(args.all).toBe(true);
    expect(args.outPath).toContain('custom/dir');
  });

  it('parses --facts and --registry', () => {
    const args = parseArgs(['--facts', 'my-facts.json', '--registry', 'reg.json']);
    expect(args.factsPath).toContain('my-facts.json');
    expect(args.registryPath).toContain('reg.json');
  });
});
