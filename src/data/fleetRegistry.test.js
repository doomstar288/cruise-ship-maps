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
import { CATEGORIES, STATUSES, validateOverrides } from '../../scripts/fleet-registry-build.mjs';

// Exercised against the committed registry so the tests also guard the
// generated artifact, not just the helper logic.
const registry = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/data/fleet-registry.json'), 'utf8')
);
const overrides = JSON.parse(
  readFileSync(resolve(__dirname, '../../scripts/fleet-overrides.json'), 'utf8')
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

  it('gives every ship a known lifecycle status and category', () => {
    for (const ship of registry.ships) {
      expect(STATUSES).toContain(ship.status);
      expect(CATEGORIES).toContain(ship.category);
    }
    const counted = Object.values(registry.stats.byStatus).reduce((a, b) => a + b, 0);
    expect(counted).toBe(registry.ships.length);
  });

  it('references every class in the index from at least one ship', () => {
    const shipClassIds = new Set(registry.ships.map((s) => s.shipClassId).filter(Boolean));
    for (const cls of registry.classes) {
      expect(shipClassIds.has(cls.id)).toBe(true);
      expect(cls.shipCount).toBe(cls.imos.length);
    }
  });
});

// Guards against hand-editing the overrides file without re-running the seeder.
describe('fleet overrides', () => {
  it('is a valid overrides file', () => {
    expect(validateOverrides(overrides)).toEqual([]);
  });

  it('is reflected in the committed registry', () => {
    for (const entry of overrides.overrides) {
      const ship = findShipByImo(registry, entry.imo);
      if (entry.exclude) {
        expect(ship, `IMO ${entry.imo} should be excluded`).toBeNull();
        continue;
      }
      const fields = entry.set ?? entry.add;
      expect(ship, `IMO ${entry.imo} should exist`).not.toBeNull();
      expect(ship).toMatchObject(fields);
      expect(ship.overriddenFields).toEqual(expect.arrayContaining(Object.keys(fields)));
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

  it('filters an operator’s ships by status', () => {
    const all = getShipsByOperator(registry, 'Royal Caribbean');
    const active = getShipsByOperator(registry, 'Royal Caribbean', { status: 'in_service' });
    expect(active.length).toBeGreaterThan(5);
    expect(active.length).toBeLessThanOrEqual(all.length);
    expect(active.every((s) => s.status === 'in_service')).toBe(true);
  });

  it('attributes sold ships to their current operator, not a former one', () => {
    // Azamara Pursuit sailed for Princess and P&O before Azamara (dated on Wikidata).
    const pursuit = findShipByImo(registry, '9210220');
    expect(pursuit.operator).toBe('Azamara');
    expect(pursuit.formerOperators).toEqual(expect.arrayContaining(['Princess Cruises']));
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
