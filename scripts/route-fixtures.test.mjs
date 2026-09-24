import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { ROUTE_COSTS, createRouter } from '../src/utils/shipRouter.js';
import {
  AVOID_LIFTS_FIXTURE_CASES,
  FIXTURE_TOLERANCE,
  ROUTE_FIXTURE_CASES,
  fixturesPath,
  packPath,
  routerEndpoint,
  runFixture,
  withinTolerance,
} from './route-fixtures.mjs';

describe.each(Object.keys(ROUTE_FIXTURE_CASES))('route fixtures for %s', (shipId) => {
  // The published files, exactly as a consumer fetches them.
  const pack = JSON.parse(readFileSync(packPath(shipId), 'utf8'));
  const fixtures = JSON.parse(readFileSync(fixturesPath(shipId), 'utf8'));
  const router = createRouter(pack.routing);
  const cases = ROUTE_FIXTURE_CASES[shipId];
  const avoidLiftsCases = AVOID_LIFTS_FIXTURE_CASES[shipId] ?? [];
  const everyFixture = [...fixtures.routes, ...fixtures.avoidLiftsRoutes];

  it('records the cases, cost model and tolerances this repo defines', () => {
    expect(fixtures).toMatchObject({ specVersion: 1, shipId, tolerance: FIXTURE_TOLERANCE });
    expect(fixtures.costModel).toEqual({
      walkingSpeedMps: pack.routing.walkingSpeedMps,
      ...ROUTE_COSTS,
    });
    expect(fixtures.routes.map(({ expected: _expected, ...c }) => c)).toEqual(
      cases.map((c) => ({ ...c, stepFree: c.stepFree ?? false }))
    );
    // Option cases live in their own array, so a port without the option still
    // passes every `routes[]` entry.
    expect(fixtures.avoidLiftsRoutes.map(({ expected: _expected, ...c }) => c)).toEqual(
      avoidLiftsCases.map((c) => ({ ...c, stepFree: c.stepFree ?? false, avoidLifts: true }))
    );
    expect(fixtures.routes.some((r) => 'avoidLifts' in r)).toBe(false);
    expect(new Set(everyFixture.map((r) => r.id)).size).toBe(everyFixture.length);
  });

  it('names ends that exist in the pack', () => {
    for (const { from, to } of everyFixture) {
      for (const end of [from, to]) {
        if (end.featureId) expect(router.hasFeature(end.featureId)).toBe(true);
        else if (end.cabinId) expect(routerEndpoint(pack, end).at).toHaveLength(2);
        else expect(end.elevators).toBe(true);
      }
    }
  });

  it.each(everyFixture.map((r) => [r.id, r]))(
    '%s matches the router within tolerance',
    (id, fixture) => {
      const actual = runFixture(router, pack, fixture);
      const { expected } = fixture;
      // Only an avoidLifts case that is step-free too may have no route.
      if (expected === null) {
        expect(fixture.avoidLifts && fixture.stepFree).toBe(true);
        expect(actual).toBeNull();
        return;
      }
      expect(actual).not.toBeNull();
      expect(actual.deckChanges).toEqual(expected.deckChanges);
      expect(actual.through).toEqual(expected.through);
      expect(
        withinTolerance(actual.walkM, expected.walkM, fixtures.tolerance.walkM),
        `walkM ${actual.walkM}`
      ).toBe(true);
      expect(
        withinTolerance(actual.timeS, expected.timeS, fixtures.tolerance.timeS),
        `timeS ${actual.timeS}`
      ).toBe(true);
    }
  );

  it('covers every kind of trip a port has to get right', () => {
    const all = fixtures.routes;
    const modes = (r) => r.expected.deckChanges.map((c) => c.mode);
    expect(all.some((r) => modes(r).length === 0)).toBe(true);
    expect(all.some((r) => modes(r).includes('stairs'))).toBe(true);
    expect(all.some((r) => r.stepFree && modes(r).includes('elevator'))).toBe(true);
    expect(
      all.some((r) =>
        r.expected.deckChanges.some(
          (c) => Math.abs(c.toDeck - c.fromDeck) > 1 && c.mode === 'stairs'
        )
      )
    ).toBe(true);
    expect(
      all.some((r) => r.expected.deckChanges.some((c) => c.fromDeck === 12 && c.toDeck > 13))
    ).toBe(true);
    expect(all.some((r) => r.expected.through.length > 0)).toBe(true);
    expect(all.some((r) => r.from.cabinId && r.to.cabinId)).toBe(true);
    expect(all.some((r) => r.from.elevators)).toBe(true);
    // Same deck, different walk sections: out by lift and back.
    expect(
      all.some(
        (r) =>
          r.expected.deckChanges.length === 2 &&
          r.expected.deckChanges[0].fromDeck === r.expected.deckChanges[1].toDeck
      )
    ).toBe(true);
  });

  it('routes to every port exit from cabins on three decks, each with a step-free twin', () => {
    const exits = pack.decks.flatMap((d) => d.features.filter((f) => f.portExit).map((f) => f.id));
    expect(exits.length).toBeGreaterThan(0);
    for (const exit of exits) {
      const plain = fixtures.routes.filter((r) => r.to.featureId === exit && r.from.cabinId && !r.stepFree);
      expect(new Set(plain.map((r) => routerEndpoint(pack, r.from).deck)).size, exit).toBeGreaterThanOrEqual(3);
      for (const r of plain) {
        const twin = fixtures.routes.find((t) => t.id === `${r.id}-step-free`);
        expect(twin, r.id).toMatchObject({ from: r.from, to: r.to, stepFree: true });
      }
    }
  });

  it('holds a step-free twin to never be cheaper than its stairs-allowed trip', () => {
    for (const twin of fixtures.routes.filter((r) => r.stepFree)) {
      const plain = fixtures.routes.find((r) => r.id === twin.id.replace(/-step-free$/, ''));
      if (!plain) continue;
      expect(plain.expected.timeS).toBeLessThanOrEqual(twin.expected.timeS);
    }
  });

  it('never takes a lift when avoiding lifts, and is never quicker for it', () => {
    let liftWouldWin = 0;
    for (const fixture of fixtures.avoidLiftsRoutes.filter((r) => r.expected)) {
      const { expected } = fixture;
      expect(
        expected.deckChanges.every((c) => c.mode === 'stairs'),
        fixture.id
      ).toBe(true);
      const unrestricted = runFixture(router, pack, { from: fixture.from, to: fixture.to });
      expect(expected.timeS, fixture.id).toBeGreaterThanOrEqual(unrestricted.timeS);
      if (unrestricted.deckChanges.some((c) => c.mode === 'elevator')) liftWouldWin += 1;
    }
    expect(liftWouldWin).toBeGreaterThan(0);
  });

  it('covers every kind of avoidLifts trip a port has to get right', () => {
    const all = fixtures.avoidLiftsRoutes;
    const changes = (r) => r.expected?.deckChanges ?? [];
    // Deck 12 to 14 by stairs is one flight.
    expect(
      all.some((r) =>
        changes(r).some(
          (c) => Math.min(c.fromDeck, c.toDeck) <= 12 && Math.max(c.fromDeck, c.toDeck) >= 14
        )
      )
    ).toBe(true);
    // Same deck, different walk sections: out by the stairs and back.
    expect(
      all.some((r) => changes(r).length === 2 && changes(r)[0].fromDeck === changes(r)[1].toDeck)
    ).toBe(true);
    // Step-free as well: a walk within one walk section, and no route beyond it.
    expect(all.some((r) => r.stepFree && r.expected && changes(r).length === 0)).toBe(true);
    expect(all.some((r) => r.stepFree && r.expected === null)).toBe(true);
  });
});
