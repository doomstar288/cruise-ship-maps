#!/usr/bin/env node
/**
 * Shared route fixtures (roadmap P2.5).
 *
 * `v1/ships/<id>/route-fixtures.json` is the routing contract between this
 * repo's router (src/utils/shipRouter.js) and AuraTrip's TypeScript port: for
 * each case, the expected walk length, time and deck changes, with tolerances.
 *
 * The file is RECORDED, not regenerated on every export, so a change to the
 * layout, the graph or the router shows up as a failing test rather than a
 * silent diff. Re-record deliberately and say why in the PR:
 *
 *   npm run record:route-fixtures
 *
 * See docs/architecture/ship_map_pack_routing.md#route-fixtures.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROUTE_COSTS, createRouter } from '../src/utils/shipRouter.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const packPath = (shipId) => resolve(REPO_ROOT, `public/v1/ships/${shipId}/plan.json`);
export const fixturesPath = (shipId) =>
  resolve(REPO_ROOT, `public/v1/ships/${shipId}/route-fixtures.json`);

/** A router's result may differ from a fixture by at most max(abs, rel × expected). */
export const FIXTURE_TOLERANCE = Object.freeze({
  walkM: { abs: 2, rel: 0.03 },
  timeS: { abs: 5, rel: 0.05 },
});

const cabin = (cabinId) => ({ cabinId });
const venue = (featureId) => ({ featureId });
const lifts = (deck) => ({ deck, elevators: true });

/**
 * The cases, per ship. Each one pins down a behaviour a port could get wrong:
 * cabin snapping, stairs vs lifts, step-free, walk sections joined only by
 * lifts, and each kind of connector.
 */
export const ROUTE_FIXTURE_CASES = {
  'celebrity-xcel': [
    {
      id: 'cabin-10-to-magic-carpet-5',
      description:
        'Cabin snap, a lift ride down, then through World Class Bar onto the Magic Carpet',
      from: cabin('c10-10175'),
      to: venue('v5-magic-carpet'),
    },
    {
      id: 'suite-12-to-sunset-bar-15',
      description: 'Two decks: stairs beat the lift wait',
      from: cabin('c12-12100'),
      to: venue('v15-sunset-bar'),
    },
    {
      id: 'suite-12-to-sunset-bar-15-step-free',
      description: 'The same trip step-free takes the lift',
      from: cabin('c12-12100'),
      to: venue('v15-sunset-bar'),
      stepFree: true,
    },
    {
      id: 'cabin-3-to-theatre-4',
      description: 'One deck up by the stairs at the forward core',
      from: cabin('c3-3100'),
      to: venue('v4-theatre'),
    },
    {
      id: 'theatre-4-to-grand-plaza-5',
      description:
        'Deck 4 is split, so the route drops to Deck 3 to get aft; consecutive flights count as one change',
      from: venue('v4-theatre'),
      to: venue('v5-grand-plaza'),
    },
    {
      id: 'theatre-4-to-grand-plaza-5-step-free',
      description: 'The same trip step-free: two lift rides',
      from: venue('v4-theatre'),
      to: venue('v5-grand-plaza'),
      stepFree: true,
    },
    {
      id: 'le-voyage-to-casino-4',
      description: 'Same deck, same walk section: walking only',
      from: venue('v4-le-voyage'),
      to: venue('v4-casino'),
    },
    {
      id: 'le-voyage-to-theatre-4-step-free',
      description: 'Same deck, different walk sections: via a lift and back',
      from: venue('v4-le-voyage'),
      to: venue('v4-theatre'),
      stepFree: true,
    },
    {
      id: 'lifts-4-to-mosaic',
      description: 'Nearest Deck 4 lobby to Mosaic, along the Cosmopolitan/Cyprus connector',
      from: lifts(4),
      to: venue('v4-mosaic'),
    },
    {
      id: 'lifts-5-to-spice-cafe',
      description: 'Nearest Deck 5 lobby to Spice Café, through Market at The Bazaar',
      from: lifts(5),
      to: venue('v5-spice-cafe'),
    },
    {
      id: 'retreat-lounge-to-sunset-bar-15-step-free',
      description: 'Deck 15 sections joined only by lifts',
      from: venue('v15-retreat-lounge'),
      to: venue('v15-sunset-bar'),
      stepFree: true,
    },
    {
      id: 'edge-villa-15-to-retreat-bar-17-step-free',
      description: 'An Edge Villa (the long snap) to the Retreat Bar across the sundeck',
      from: cabin('c15-15100'),
      to: venue('v17-retreat-bar'),
      stepFree: true,
    },
    {
      id: 'cabin-8-to-magic-carpet-16-step-free',
      description: 'Through the Glass-Walled Hot Tubs onto the Deck 16 Magic Carpet stop',
      from: cabin('c8-8100'),
      to: venue('v16-magic-carpet'),
      stepFree: true,
    },
    {
      id: 'cabin-8-to-cabin-8',
      description: 'Cabin to cabin on one deck: both ends snap',
      from: cabin('c8-8100'),
      to: cabin('c8-8337'),
    },
  ],
};

/** A fixture endpoint as a router endpoint. Cabins snap from their pack centre. */
export function routerEndpoint(pack, endpoint) {
  if (!endpoint.cabinId) return endpoint;
  for (const deck of pack.decks) {
    const feature = deck.features.find((f) => f.id === endpoint.cabinId);
    if (feature) return { deck: deck.deckNumber, at: feature.center, cabinId: feature.id };
  }
  throw new Error(`Pack has no cabin ${endpoint.cabinId}`);
}

const throughOf = (route) => [...new Set(route.legs.flatMap((leg) => leg.through ?? []))].sort();

/** Route one case, in the shape its `expected` block records. */
export function runFixture(router, pack, { from, to, stepFree = false }) {
  const route = router.route(routerEndpoint(pack, from), routerEndpoint(pack, to), { stepFree });
  if (!route) return null;
  return {
    walkM: route.walkM,
    timeS: route.timeS,
    deckChanges: route.deckChanges,
    through: throughOf(route),
  };
}

export const withinTolerance = (actual, expected, { abs, rel }) =>
  Math.abs(actual - expected) <= Math.max(abs, rel * Math.abs(expected));

export function recordRouteFixtures(pack, cases = ROUTE_FIXTURE_CASES[pack.shipId]) {
  if (!cases) throw new Error(`No route fixture cases for ${pack.shipId}`);
  const router = createRouter(pack.routing);
  return {
    specVersion: 1,
    shipId: pack.shipId,
    recordedAgainstRevision: pack.revision,
    costModel: { walkingSpeedMps: pack.routing.walkingSpeedMps, ...ROUTE_COSTS },
    tolerance: FIXTURE_TOLERANCE,
    routes: cases.map((c) => {
      const expected = runFixture(router, pack, c);
      if (!expected) throw new Error(`Fixture ${c.id} has no route`);
      return { ...c, stepFree: c.stepFree ?? false, expected };
    }),
  };
}

async function main() {
  for (const shipId of Object.keys(ROUTE_FIXTURE_CASES)) {
    const pack = JSON.parse(await readFile(packPath(shipId), 'utf8'));
    const fixtures = recordRouteFixtures(pack);
    await writeFile(fixturesPath(shipId), `${JSON.stringify(fixtures, null, 2)}\n`);
    console.log(
      `${shipId}: recorded ${fixtures.routes.length} route fixtures against rev ${pack.revision}`
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
