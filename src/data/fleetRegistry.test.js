import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findShipByImo,
  findShipByName,
  getSisterShips,
  getShipsByOperator,
  getClassesByCoverage,
} from './fleetRegistry';
import { isValidImo } from '../utils/imo';

// Exercised against the committed registry so the tests also guard the
// generated artifact, not just the helper logic.
const registry = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/data/fleet-registry.json'), 'utf8')
);

describe('fleet registry artifact', () => {
  it('carries CC0 provenance', () => {
    expect(registry.provenance.source).toMatch(/Wikidata/i);
    expect(registry.provenance.license).toBe('CC0-1.0');
    expect(registry.provenance.retrievedAt).toBeTruthy();
  });

  it('contains a substantial fleet', () => {
    expect(registry.ships.length).toBeGreaterThan(400);
    expect(registry.classes.length).toBeGreaterThan(20);
  });

  it('keeps IMO numbers unique', () => {
    const imos = registry.ships.map((s) => s.imo);
    expect(new Set(imos).size).toBe(imos.length);
  });

  it('flags rather than hides invalid IMO checksums', () => {
    for (const ship of registry.ships) {
      expect(ship.imoValid).toBe(isValidImo(ship.imo));
    }
    // A handful of pre-IMO-scheme historic vessels are expected to fail.
    expect(registry.stats.invalidImoChecksums).toBeLessThan(20);
  });

  it('references every class in the index from at least one ship', () => {
    const shipClassIds = new Set(registry.ships.map((s) => s.shipClassId).filter(Boolean));
    for (const cls of registry.classes) {
      expect(shipClassIds.has(cls.id)).toBe(true);
      expect(cls.shipCount).toBe(cls.imos.length);
    }
  });
});

describe('lookup helpers', () => {
  it('finds Celebrity Xcel by its real IMO', () => {
    const ship = findShipByImo(registry, '9884136');
    expect(ship?.name).toBe('Celebrity Xcel');
    expect(ship.operator).toBe('Celebrity Cruises');
  });

  it('finds ships by name', () => {
    expect(findShipByName(registry, 'Icon of the Seas')?.imo).toBe('9829930');
    expect(findShipByName(registry, 'icon of the seas')?.imo).toBe('9829930');
  });

  it('returns null for unknown lookups', () => {
    expect(findShipByImo(registry, '0000000')).toBeNull();
    expect(findShipByName(registry, 'SS Nonexistent')).toBeNull();
  });

  it('lists ships for an operator', () => {
    const rcl = getShipsByOperator(registry, 'Royal Caribbean');
    expect(rcl.length).toBeGreaterThan(5);
    expect(rcl.every((s) => /royal caribbean/i.test(s.operator))).toBe(true);
  });
});

describe('sister-ship derivation', () => {
  it('returns classmates without the ship itself', () => {
    const icon = findShipByImo(registry, '9829930');
    const sisters = getSisterShips(registry, icon.imo);
    expect(sisters.length).toBeGreaterThan(0);
    expect(sisters.every((s) => s.shipClassId === icon.shipClassId)).toBe(true);
    expect(sisters.some((s) => s.imo === icon.imo)).toBe(false);
  });

  it('returns nothing for an unclassed vessel', () => {
    const unclassed = registry.ships.find((s) => !s.shipClassId);
    expect(getSisterShips(registry, unclassed.imo)).toEqual([]);
  });

  it('ranks classes by how many vessels one deck plan would cover', () => {
    const ranked = getClassesByCoverage(registry);
    expect(ranked[0].shipCount).toBeGreaterThanOrEqual(ranked.at(-1).shipCount);
    expect(ranked.every((c) => c.shipCount >= 2)).toBe(true);
  });
});
