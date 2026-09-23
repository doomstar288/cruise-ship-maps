/**
 * Fleet Routing Engine.
 *
 * Dynamically provides Dijkstra routing graphs, sample routes, and custom
 * point-to-point wayfinding for all published ships in the fleet.
 */

import xcelPlan from '../../public/v1/ships/celebrity-xcel/plan.json' with { type: 'json' };
import ascentPlan from '../../public/v1/ships/celebrity-ascent/plan.json' with { type: 'json' };
import beyondPlan from '../../public/v1/ships/celebrity-beyond/plan.json' with { type: 'json' };
import apexPlan from '../../public/v1/ships/celebrity-apex/plan.json' with { type: 'json' };
import edgePlan from '../../public/v1/ships/celebrity-edge/plan.json' with { type: 'json' };
import solsticePlan from '../../public/v1/ships/celebrity-solstice/plan.json' with { type: 'json' };
import equinoxPlan from '../../public/v1/ships/celebrity-equinox/plan.json' with { type: 'json' };
import eclipsePlan from '../../public/v1/ships/celebrity-eclipse/plan.json' with { type: 'json' };
import silhouettePlan from '../../public/v1/ships/celebrity-silhouette/plan.json' with { type: 'json' };
import reflectionPlan from '../../public/v1/ships/celebrity-reflection/plan.json' with { type: 'json' };
import millenniumPlan from '../../public/v1/ships/celebrity-millennium/plan.json' with { type: 'json' };
import infinityPlan from '../../public/v1/ships/celebrity-infinity/plan.json' with { type: 'json' };
import summitPlan from '../../public/v1/ships/celebrity-summit/plan.json' with { type: 'json' };
import constellationPlan from '../../public/v1/ships/celebrity-constellation/plan.json' with { type: 'json' };

import { createRouter } from '../utils/shipRouter.js';
import { buildRoute } from '../utils/wayfinding.js';

const ROUTING_PLANS = {
  'celebrity-xcel': xcelPlan.routing,
  'celebrity-ascent': ascentPlan.routing,
  'celebrity-beyond': beyondPlan.routing,
  'celebrity-apex': apexPlan.routing,
  'celebrity-edge': edgePlan.routing,
  'celebrity-solstice': solsticePlan.routing,
  'celebrity-equinox': equinoxPlan.routing,
  'celebrity-eclipse': eclipsePlan.routing,
  'celebrity-silhouette': silhouettePlan.routing,
  'celebrity-reflection': reflectionPlan.routing,
  'celebrity-millennium': millenniumPlan.routing,
  'celebrity-infinity': infinityPlan.routing,
  'celebrity-summit': summitPlan.routing,
  'celebrity-constellation': constellationPlan.routing,
};

const ROUTERS = new Map();

/**
 * Returns a cached router for the specified vessel.
 */
export function getShipRouter(shipId = 'celebrity-xcel') {
  if (!ROUTERS.has(shipId)) {
    const routing = ROUTING_PLANS[shipId] ?? xcelPlan.routing;
    ROUTERS.set(shipId, createRouter(routing));
  }
  return ROUTERS.get(shipId);
}

/**
 * Finds the first cabin of a class on a deck.
 */
export function findCabinOfClass(decks, level, cabinClass, side) {
  const deck = decks.find((d) => d.level === level);
  if (!deck) return null;
  const cabin = deck.venues.find(
    (v) => v.cabinClass === cabinClass && (!side || v.side?.toLowerCase() === side.toLowerCase())
  );
  return cabin?.id ?? null;
}

/**
 * Generates sample routes tailored for the specific vessel's available venues.
 */
export function getSampleRoutesForShip(shipId, decks, { stepFree = false } = {}) {
  const router = getShipRouter(shipId);

  // Pick destination candidates available on this vessel
  const findVenue = (predicate) => {
    for (const d of decks) {
      const match = d.venues.find(predicate);
      if (match) return { deck: d.level, venueId: match.id };
    }
    return null;
  };

  const diningDest =
    findVenue((v) => v.id === 'v4-le-voyage') ??
    findVenue((v) => v.id === 'v4-eden-restaurant') ??
    findVenue((v) => v.id === 'v4-martini-bar') ??
    findVenue((v) => v.id === 'v5-murano') ??
    findVenue((v) => v.id === 'v4-main-restaurant') ??
    findVenue((v) => v.id === 'v5-magic-carpet');

  const aftDest =
    findVenue((v) => v.id === 'v15-sunset-bar') ??
    findVenue((v) => v.id === 'v11-sunset-bar') ??
    findVenue((v) => v.id === 'v10-solarium') ??
    findVenue((v) => v.id === 'v14-oceanview-cafe') ??
    findVenue((v) => v.id === 'v10-oceanview-cafe');

  const theatreDest =
    findVenue((v) => v.id === 'v4-theatre') ??
    findVenue((v) => v.id === 'v3-theatre');

  const specs = [];

  // Route 1: Mid-tier stateroom to evening dining / lounge
  if (diningDest) {
    const dMid =
      decks.find((d) => d.level === 10 && d.venues.some((v) => v.id.startsWith('c10-'))) ??
      decks.find((d) => d.level === 8 && d.venues.some((v) => v.id.startsWith('c8-'))) ??
      decks.find((d) => d.level === 7 && d.venues.some((v) => v.id.startsWith('c7-')));
    const cMid =
      (dMid && findCabinOfClass(decks, dMid.level, 'C2', 'Starboard')) ??
      (dMid && findCabinOfClass(decks, dMid.level, 'E1')) ??
      dMid?.venues.find((v) => v.id.startsWith(`c${dMid.level}-`))?.id;

    if (cMid && dMid) {
      specs.push({
        id: `${shipId}-route-1`,
        from: { deck: dMid.level, venueId: cMid },
        to: diningDest,
      });
    }
  }

  // Route 2: High suite / stateroom to aft scenic terrace / pool deck
  if (aftDest) {
    const dHigh =
      decks.find((d) => d.level === 12 && d.venues.some((v) => v.id.startsWith('c12-'))) ??
      decks.find((d) => d.level === 9 && d.venues.some((v) => v.id.startsWith('c9-'))) ??
      decks.find((d) => d.level === 8 && d.venues.some((v) => v.id.startsWith('c8-')));
    const cHigh =
      (dHigh && findCabinOfClass(decks, dHigh.level, 'IC', 'Port')) ??
      (dHigh && findCabinOfClass(decks, dHigh.level, 'S1')) ??
      (dHigh && findCabinOfClass(decks, dHigh.level, 'A1')) ??
      dHigh?.venues.find((v) => v.id.startsWith(`c${dHigh.level}-`))?.id;

    if (cHigh && dHigh) {
      specs.push({
        id: `${shipId}-route-2`,
        from: { deck: dHigh.level, venueId: cHigh },
        to: aftDest,
      });
    }
  }

  // Route 3: Lower stateroom to Theatre
  if (theatreDest) {
    const dLow =
      decks.find((d) => d.level === 3 && d.venues.some((v) => v.id.startsWith('c3-'))) ??
      decks.find((d) => d.level === 6 && d.venues.some((v) => v.id.startsWith('c6-')));
    const cLow =
      (dLow && findCabinOfClass(decks, dLow.level, 'O2', 'Port')) ??
      dLow?.venues.find((v) => v.id.startsWith(`c${dLow.level}-`))?.id;

    if (cLow && dLow) {
      specs.push({
        id: `${shipId}-route-3`,
        from: { deck: dLow.level, venueId: cLow },
        to: theatreDest,
      });
    }
  }

  return specs
    .map((spec) => {
      try {
        const route = buildRoute(decks, router, spec, { stepFree });
        return { ...route, spec };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Builds a route between two arbitrary endpoints on the vessel.
 */
export function routeOnShip(shipId, decks, spec, options) {
  const router = getShipRouter(shipId);
  return buildRoute(decks, router, spec, options);
}
