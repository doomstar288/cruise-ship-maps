/**
 * Fleet Routing Engine.
 *
 * Provides Dijkstra routing graphs, sample routes, and custom point-to-point
 * wayfinding for the published ships in the fleet.
 *
 * A ship's routing graph lives inside its Ship Map Pack, which is served from
 * `public/v1/ships/<shipId>/plan.json` rather than bundled: the packs total
 * several megabytes and only the ~4 % of each one under `routing` is used
 * here, so bundling them would cost the whole fleet's deck geometry on every
 * first paint. Callers `await loadShipRouting(shipId)` once, then route
 * synchronously against the cached graph.
 */

import { createRouter } from '../utils/shipRouter.js';
import { buildRoute } from '../utils/wayfinding.js';

const ROUTERS = new Map();
const IN_FLIGHT = new Map();

/** @returns {string} the pack URL, resolved against Vite's BASE_URL. */
function packUrl(shipId) {
  const base = import.meta.env?.BASE_URL ?? './';
  return `${base.endsWith('/') ? base : `${base}/`}v1/ships/${shipId}/plan.json`;
}

/**
 * Fetches a ship's pack and caches a router over its routing graph. Repeat
 * calls reuse the cache, and concurrent calls share one request.
 *
 * @param {string} shipId
 * @param {typeof fetch} [fetchImpl] test seam
 * @returns {Promise<object>} the cached router
 */
export async function loadShipRouting(shipId, fetchImpl = globalThis.fetch) {
  if (ROUTERS.has(shipId)) return ROUTERS.get(shipId);
  if (IN_FLIGHT.has(shipId)) return IN_FLIGHT.get(shipId);

  const request = fetchImpl(packUrl(shipId))
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load pack for "${shipId}" (${response.status})`);
      }
      return response.json();
    })
    .then((pack) => {
      if (!pack?.routing) {
        throw new Error(`Pack for "${shipId}" carries no routing graph`);
      }
      const router = createRouter(pack.routing);
      ROUTERS.set(shipId, router);
      IN_FLIGHT.delete(shipId);
      return router;
    })
    .catch((error) => {
      IN_FLIGHT.delete(shipId);
      throw error;
    });

  IN_FLIGHT.set(shipId, request);
  return request;
}

/**
 * Returns the loaded router for a vessel.
 *
 * Throws rather than falling back to another ship's graph: pairing one ship's
 * decks with another's routing graph yields confident, wrong directions.
 *
 * @param {string} shipId
 * @returns {object} the cached router
 */
export function getShipRouter(shipId) {
  const router = ROUTERS.get(shipId);
  if (!router) {
    throw new Error(`Routing for "${shipId}" is not loaded; await loadShipRouting() first.`);
  }
  return router;
}

/** @returns {boolean} whether this ship's routing graph is ready to route on. */
export function isShipRoutingLoaded(shipId) {
  return ROUTERS.has(shipId);
}

/** Test seam: drops every cached router. */
export function resetShipRoutingCache() {
  ROUTERS.clear();
  IN_FLIGHT.clear();
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
