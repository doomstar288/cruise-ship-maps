#!/usr/bin/env node
/**
 * Shared route fixtures (roadmap P2.5).
 *
 * `v1/ships/<id>/route-fixtures.json` is the routing contract between this
 * repo's router (src/utils/shipRouter.js) and AuraTrip's TypeScript port: for
 * each case, the expected walk length, time and deck changes, with tolerances,
 * and for each `nearest` case (P7.5) the winning candidate too.
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
    // Port exits (P7.3): cabins on three decks to each `portExit`, each with a
    // step-free twin. Both exits are reached only from Deck 2's midship lobby.
    {
      id: 'cabin-3-to-gangway-2',
      description: 'Aft along Deck 3 to the midship core, then one flight down to the gangway',
      from: cabin('c3-3100'),
      to: venue('v2-gangway'),
    },
    {
      id: 'cabin-3-to-gangway-2-step-free',
      description: 'The same trip step-free: the midship lift down one deck',
      from: cabin('c3-3100'),
      to: venue('v2-gangway'),
      stepFree: true,
    },
    {
      id: 'cabin-3-to-tender-platform-2',
      description: 'One flight down at midship, then through Destination Gateway onto the Magic Carpet',
      from: cabin('c3-3100'),
      to: venue('v2-magic-carpet'),
    },
    {
      id: 'cabin-3-to-tender-platform-2-step-free',
      description: 'The same trip step-free: the midship lift down one deck',
      from: cabin('c3-3100'),
      to: venue('v2-magic-carpet'),
      stepFree: true,
    },
    {
      id: 'aft-cabin-8-to-gangway-2',
      description: 'Past the aft lifts, whose Deck 2 stop opens onto crew space, to the midship lift',
      from: cabin('c8-8337'),
      to: venue('v2-gangway'),
    },
    {
      id: 'aft-cabin-8-to-gangway-2-step-free',
      description: 'The same trip step-free: it takes no stairs anyway',
      from: cabin('c8-8337'),
      to: venue('v2-gangway'),
      stepFree: true,
    },
    {
      id: 'aft-cabin-8-to-tender-platform-2',
      description: 'The midship lift down, then through Destination Gateway onto the Magic Carpet',
      from: cabin('c8-8337'),
      to: venue('v2-magic-carpet'),
    },
    {
      id: 'aft-cabin-8-to-tender-platform-2-step-free',
      description: 'The same trip step-free: it takes no stairs anyway',
      from: cabin('c8-8337'),
      to: venue('v2-magic-carpet'),
      stepFree: true,
    },
    {
      id: 'edge-villa-15-to-gangway-2',
      description: "Deck 2's forward lobby doesn't reach the gangway: lift to Deck 3, aft, one flight down",
      from: cabin('c15-15100'),
      to: venue('v2-gangway'),
    },
    {
      id: 'edge-villa-15-to-gangway-2-step-free',
      description: 'The same trip step-free: two lift rides',
      from: cabin('c15-15100'),
      to: venue('v2-gangway'),
      stepFree: true,
    },
    {
      id: 'edge-villa-15-to-tender-platform-2',
      description: 'Lift to Deck 3, aft, one flight down, then through Destination Gateway',
      from: cabin('c15-15100'),
      to: venue('v2-magic-carpet'),
    },
    {
      id: 'edge-villa-15-to-tender-platform-2-step-free',
      description: 'The same trip step-free: two lift rides',
      from: cabin('c15-15100'),
      to: venue('v2-magic-carpet'),
      stepFree: true,
    },
  ],
};

/** What a stateroom guest's "nearest bar" is filtered down to by `access` (P7.1). */
const XCEL_PUBLIC_BARS = [
  'v3-martini-bar',
  'v4-craft-social',
  'v5-annex',
  'v5-world-class-bar',
  'v15-sunset-bar',
  'v16-mast-bar',
];
/** Fine dining the pack lists as public (Luminae is suite-only). */
const XCEL_FINE_DINING = [
  'v3-normandie',
  'v3-tuscan',
  'v4-le-voyage',
  'v4-le-grand-bistro',
  'v4-cosmopolitan',
  'v4-cyprus',
  'v4-mosaic',
  'v5-raw-on-5',
  'v5-blu',
  'v5-fine-cut',
  'v15-bora',
];
/** The pack's public restrooms (P7.5), from Celebrity's own deck plan. */
const XCEL_RESTROOMS = [
  'restrooms-mid-2',
  'restrooms-aft-3',
  'restrooms-fwd-4',
  'restrooms-mid-4',
  'restrooms-aft-4',
  'restrooms-fwd-5',
  'restrooms-mid-5',
  'restrooms-aft-5',
  'restrooms-fwd-port-14',
  'restrooms-fwd-stbd-14',
  'restrooms-mid-port-14',
  'restrooms-mid-stbd-14',
  'restrooms-aft-15',
];
const lobbies = (bank, decks) => decks.map((deck) => `elev-${bank}-${deck}`);
/** Every lift lobby, per the bank service table in ship_map_pack_routing.md. */
const XCEL_LIFTS = [
  ...lobbies('fwd', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17]),
  ...lobbies('mid', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16]),
  ...lobbies('aft', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15]),
];

/**
 * `routeToNearest` cases (P7.5), per ship. They get their own `nearest` array because a
 * port runs every `routes[]` entry through route(). Each one pins down the winner, not
 * just its time, so a port has to rank candidates exactly as this router does.
 */
export const NEAREST_FIXTURE_CASES = {
  'celebrity-xcel': [
    {
      id: 'nearest-bar-from-cabin-10',
      description: "A stateroom guest's nearest public bar is six decks up, by lift",
      from: cabin('c10-10175'),
      candidates: XCEL_PUBLIC_BARS,
    },
    {
      id: 'nearest-bar-from-suite-12',
      description: 'A suite guest may use the Retreat, so the list includes it, and it wins',
      from: cabin('c12-12100'),
      candidates: [...XCEL_PUBLIC_BARS, 'v15-retreat-lounge', 'v17-retreat-bar'],
    },
    {
      id: 'nearest-bar-from-cabin-6',
      description: 'One flight down to World Class Bar',
      from: cabin('c6-6100'),
      candidates: XCEL_PUBLIC_BARS,
    },
    {
      id: 'nearest-bar-from-cabin-6-step-free',
      description: 'Step-free changes the winner: the lift down to the Martini Bar',
      from: cabin('c6-6100'),
      candidates: XCEL_PUBLIC_BARS,
      stepFree: true,
    },
    {
      id: 'nearest-bar-from-le-voyage-4',
      description: 'From a venue: up the stairs beats walking to Craft Social',
      from: venue('v4-le-voyage'),
      candidates: XCEL_PUBLIC_BARS,
    },
    {
      id: 'nearest-bar-from-le-voyage-4-step-free',
      description: 'Step-free, the winner is on the same deck',
      from: venue('v4-le-voyage'),
      candidates: XCEL_PUBLIC_BARS,
      stepFree: true,
    },
    {
      id: 'nearest-restroom-from-cabin-10',
      description: 'None on Deck 10, so the nearest of the 13 restrooms is four decks up by lift',
      from: cabin('c10-10175'),
      candidates: XCEL_RESTROOMS,
    },
    {
      id: 'nearest-lift-from-cabin-10',
      description: 'Every lift lobby on the ship: the nearest is a walk along the corridor',
      from: cabin('c10-10175'),
      candidates: XCEL_LIFTS,
    },
    {
      id: 'nearest-fine-dining-from-lifts-5',
      description:
        'Raw on 5 wins by one second, inside the time tolerance, so ranking must be exact',
      from: lifts(5),
      candidates: XCEL_FINE_DINING,
    },
    {
      id: 'nearest-lift-tie-up-listed-first',
      description:
        'A tie: one flight up or down costs the same, so the candidate listed first wins',
      from: { featureId: 'elev-fwd-5' },
      candidates: ['elev-fwd-6', 'elev-fwd-4'],
    },
    {
      id: 'nearest-lift-tie-down-listed-first',
      description: 'The same tie listed the other way round',
      from: { featureId: 'elev-fwd-5' },
      candidates: ['elev-fwd-4', 'elev-fwd-6'],
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

const expectedOf = (route) => ({
  walkM: route.walkM,
  timeS: route.timeS,
  deckChanges: route.deckChanges,
  through: throughOf(route),
});

/** Route one case, in the shape its `expected` block records. */
export function runFixture(router, pack, { from, to, stepFree = false }) {
  const route = router.route(routerEndpoint(pack, from), routerEndpoint(pack, to), { stepFree });
  return route && expectedOf(route);
}

/** Run one `nearest` case: the winning candidate, then the route to it. */
export function runNearestFixture(router, pack, { from, candidates, stepFree = false }) {
  const nearest = router.routeToNearest(routerEndpoint(pack, from), candidates, { stepFree });
  return nearest && { featureId: nearest.featureId, ...expectedOf(nearest.route) };
}

export const withinTolerance = (actual, expected, { abs, rel }) =>
  Math.abs(actual - expected) <= Math.max(abs, rel * Math.abs(expected));

export function recordRouteFixtures(
  pack,
  cases = ROUTE_FIXTURE_CASES[pack.shipId],
  nearestCases = NEAREST_FIXTURE_CASES[pack.shipId] ?? []
) {
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
    nearest: nearestCases.map((c) => {
      const expected = runNearestFixture(router, pack, c);
      if (!expected) throw new Error(`Nearest fixture ${c.id} reaches no candidate`);
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
      `${shipId}: recorded ${fixtures.routes.length} route and ${fixtures.nearest.length} nearest fixtures against rev ${pack.revision}`
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
