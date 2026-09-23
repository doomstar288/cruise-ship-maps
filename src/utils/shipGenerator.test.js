import { describe, it, expect } from 'vitest';
import { loadShipManifest, generateShip, aliasesFor } from './shipGenerator.js';
import { generateAllDecks as generateXcelDecks } from '../data/celebrityXcelFullDeckGenerator.js';

describe('aliasesFor', () => {
  it('strips cruise line prefix from ship name', () => {
    expect(aliasesFor('Celebrity Xcel', 'Celebrity Cruises')).toEqual(['Xcel']);
    expect(aliasesFor('Celebrity Ascent', 'Celebrity Cruises')).toEqual(['Ascent']);
    expect(aliasesFor('Celebrity Beyond', 'Celebrity Cruises')).toEqual(['Beyond']);
    expect(aliasesFor('Celebrity Apex', 'Celebrity Cruises')).toEqual(['Apex']);
    expect(aliasesFor('Celebrity Edge', 'Celebrity Cruises')).toEqual(['Edge']);
  });

  it('returns empty array if ship name does not start with cruise line prefix', () => {
    expect(aliasesFor('Queen Mary 2', 'Cunard')).toEqual([]);
  });
});

describe('loadShipManifest', () => {
  const ships = ['celebrity-xcel', 'celebrity-ascent', 'celebrity-beyond', 'celebrity-apex', 'celebrity-edge'];

  it.each(ships)('loads valid manifest for %s', (shipId) => {
    const manifest = loadShipManifest(shipId);
    expect(manifest.shipId).toBe(shipId);
    expect(manifest.name).toBeTruthy();
    expect(manifest.cruiseLine).toBe('Celebrity Cruises');
    expect(typeof manifest.lengthMeters).toBe('number');
    expect(typeof manifest.beamMeters).toBe('number');
    expect(manifest.venues.length).toBeGreaterThan(50);
  });

  it('throws on invalid or non-existent shipId', () => {
    expect(() => loadShipManifest('')).toThrow(/invalid shipId/);
    expect(() => loadShipManifest('non-existent-ship')).toThrow(/Failed to load manifest/);
  });
});

describe('generateShip', () => {
  it('produces 100% exact deck output for celebrity-xcel matching celebrityXcelFullDeckGenerator', () => {
    const xcelDirect = generateXcelDecks();
    const { metadata, decks, aliases } = generateShip('celebrity-xcel');

    expect(metadata.id).toBe('celebrity-xcel');
    expect(aliases).toEqual(['Xcel']);
    expect(decks).toEqual(xcelDirect);
  });

  it('generates all 5 ships with appropriate dimensions and deck counts', () => {
    const xcel = generateShip('celebrity-xcel');
    const ascent = generateShip('celebrity-ascent');
    const beyond = generateShip('celebrity-beyond');
    const apex = generateShip('celebrity-apex');
    const edge = generateShip('celebrity-edge');

    // 327m stretched hull ships have 15 guest decks (2-12, 14-17)
    expect(xcel.decks).toHaveLength(15);
    expect(ascent.decks).toHaveLength(15);
    expect(beyond.decks).toHaveLength(15);

    // 306m original hull ships have 14 guest decks (2-12, 14-16)
    expect(apex.decks).toHaveLength(14);
    expect(edge.decks).toHaveLength(14);

    expect(apex.decks.some((d) => d.level === 17)).toBe(false);
    expect(edge.decks.some((d) => d.level === 17)).toBe(false);
  });

  describe('venue matrix across Edge-class sister ships', () => {
    it('places Eden on Ascent, Beyond, Apex, and Edge, but The Bazaar on Xcel', () => {
      const xcel = generateShip('celebrity-xcel');
      const ascent = generateShip('celebrity-ascent');
      const apex = generateShip('celebrity-apex');

      const xcelVenues = xcel.decks.flatMap((d) => d.venues).map((v) => v.name);
      const ascentVenues = ascent.decks.flatMap((d) => d.venues).map((v) => v.name);
      const apexVenues = apex.decks.flatMap((d) => d.venues).map((v) => v.name);

      expect(xcelVenues).toContain('Mosaic at The Bazaar');
      expect(xcelVenues).toContain('Market at The Bazaar');
      expect(xcelVenues).toContain('Spice Café');
      expect(xcelVenues).toContain('The Bazaar (Upper Level)');

      expect(ascentVenues).toContain('Eden Restaurant');
      expect(ascentVenues).toContain('Eden Bar');
      expect(ascentVenues).toContain('Eden (Upper Level)');
      expect(ascentVenues).not.toContain('Mosaic at The Bazaar');

      expect(apexVenues).toContain('Eden Restaurant');
      expect(apexVenues).toContain('Eden Bar');
      expect(apexVenues).toContain('Eden (Upper Level)');
    });

    it('places Le Voyage on Xcel, Ascent, and Beyond, but not on Apex or Edge', () => {
      const beyond = generateShip('celebrity-beyond');
      const apex = generateShip('celebrity-apex');

      const beyondVenues = beyond.decks.flatMap((d) => d.venues).map((v) => v.name);
      const apexVenues = apex.decks.flatMap((d) => d.venues).map((v) => v.name);

      expect(beyondVenues).toContain('Le Voyage by Daniel Boulud');
      expect(apexVenues).not.toContain('Le Voyage by Daniel Boulud');
    });

    it('places The Annex on Xcel and Ascent, but not on Beyond, Apex, or Edge', () => {
      const ascent = generateShip('celebrity-ascent');
      const beyond = generateShip('celebrity-beyond');

      const ascentVenues = ascent.decks.flatMap((d) => d.venues).map((v) => v.name);
      const beyondVenues = beyond.decks.flatMap((d) => d.venues).map((v) => v.name);

      expect(ascentVenues).toContain('The Annex');
      expect(beyondVenues).not.toContain('The Annex');
    });

    it('places Casino Bar on Edge, and Craft Social on Xcel, Ascent, Beyond, and Apex', () => {
      const edge = generateShip('celebrity-edge');
      const apex = generateShip('celebrity-apex');

      const edgeVenues = edge.decks.flatMap((d) => d.venues).map((v) => v.name);
      const apexVenues = apex.decks.flatMap((d) => d.venues).map((v) => v.name);

      expect(edgeVenues).toContain('Casino Bar');
      expect(edgeVenues).not.toContain('Craft Social');

      expect(apexVenues).toContain('Craft Social');
      expect(apexVenues).not.toContain('Casino Bar');
    });

    it('places Luminae on Deck 12 for Apex and Edge, and on Deck 16 for Xcel, Ascent, and Beyond', () => {
      const apex = generateShip('celebrity-apex');
      const beyond = generateShip('celebrity-beyond');

      const apexD12 = apex.decks.find((d) => d.level === 12);
      const beyondD12 = beyond.decks.find((d) => d.level === 12);
      const beyondD16 = beyond.decks.find((d) => d.level === 16);

      expect(apexD12.venues.some((v) => v.name.includes('Luminae'))).toBe(true);
      expect(beyondD12.venues.some((v) => v.name.includes('Luminae'))).toBe(false);
      expect(beyondD16.venues.some((v) => v.name.includes('Luminae'))).toBe(true);
    });

    it('places Bora on Xcel only', () => {
      const xcel = generateShip('celebrity-xcel');
      const ascent = generateShip('celebrity-ascent');

      expect(xcel.decks.flatMap((d) => d.venues).some((v) => v.name === 'Bora')).toBe(true);
      expect(ascent.decks.flatMap((d) => d.venues).some((v) => v.name === 'Bora')).toBe(false);
    });
  });
});
