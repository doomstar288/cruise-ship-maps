/**
 * Corridor-following wayfinding over the synthetic deck grid.
 *
 * Routes walk along the nearer side corridor to an elevator core, ride to the
 * destination deck, and walk the same way to the venue. It is a readable
 * approximation, not a routing graph over real passageways.
 */

import { CENTERLINE_Y, CORE_STATIONS, SHIP_BEAM_M } from './deckPlanDataPipeline.js';

// Corridor centre lines: hull margin + outside cabin depth + half the corridor.
const PORT_CORRIDOR_Y = 8.5;
const STARBOARD_CORRIDOR_Y = SHIP_BEAM_M - 8.5;
const WALKING_METRES_PER_MINUTE = 70;
const DECK_HEIGHT_M = 3;

const coreId = (bank, level) => `elev-${bank}-${level}`;

const findDeck = (decks, level) => decks.find((d) => d.level === level);
const findVenue = (deck, id) => deck?.venues.find((v) => v.id === id);

const sideOf = ([, y]) => (y < CENTERLINE_Y ? 'port' : 'starboard');

function corridorWalk(from, to) {
  // Pick the corridor on the side of whichever end is not the elevator core.
  const corridorY = sideOf(to) === 'port' ? PORT_CORRIDOR_Y : STARBOARD_CORRIDOR_Y;
  const points = [from, [from[0], corridorY], [to[0], corridorY], to];
  return points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}

const pathLength = (points) =>
  points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);

/** Elevator bank present on both decks that minimises walking at either end. */
function chooseBank(decks, origin, destination) {
  const originDeck = findDeck(decks, origin.deck);
  const destDeck = findDeck(decks, destination.deck);
  let best = null;
  for (const bank of Object.keys(CORE_STATIONS)) {
    const a = findVenue(originDeck, coreId(bank, origin.deck));
    const b = findVenue(destDeck, coreId(bank, destination.deck));
    if (!a || !b) continue;
    const destWalk = Math.abs(destination.coords[0] - b.center[0]);
    const cost = (origin.coords ? Math.abs(origin.coords[0] - a.center[0]) : 0) + destWalk;
    // Banks between the two ends often tie on total walk; then prefer the
    // shorter walk on the destination deck, which the guest knows less well.
    const better = !best || cost < best.cost - 1 || (Math.abs(cost - best.cost) <= 1 && destWalk < best.destWalk);
    if (better) best = { bank, cost, destWalk };
  }
  return best?.bank ?? null;
}

const direction = (from, to) => (to[0] < from[0] ? 'forward' : 'aft');

/**
 * Build a route between two venues (or from the best elevator bank on a deck).
 * @param {Array} decks - deck records
 * @param {object} spec
 * @param {string} spec.id
 * @param {{deck: number, venueId?: string}} spec.from - omit venueId to start at the elevators
 * @param {{deck: number, venueId: string}} spec.to
 */
export function buildRoute(decks, { id, from, to }) {
  const originVenue = from.venueId ? findVenue(findDeck(decks, from.deck), from.venueId) : null;
  const destVenue = findVenue(findDeck(decks, to.deck), to.venueId);
  if ((from.venueId && !originVenue) || !destVenue) {
    throw new Error(`Route ${id} references a venue that does not exist`);
  }

  const origin = { deck: from.deck, coords: originVenue?.center ?? null };
  const destination = { deck: to.deck, name: destVenue.name, coords: destVenue.center };
  const bank = chooseBank(decks, origin, destination);
  if (!bank) throw new Error(`Route ${id} has no elevator bank shared by Decks ${from.deck} and ${to.deck}`);

  const originCore = findVenue(findDeck(decks, from.deck), coreId(bank, from.deck)).center;
  const destCore = findVenue(findDeck(decks, to.deck), coreId(bank, to.deck)).center;
  const bankName = `${CORE_STATIONS[bank].label} Elevators`;
  origin.name = originVenue?.name ?? `${bankName} (Deck ${from.deck})`;
  origin.core = originCore;
  destination.core = destCore;

  const steps = [];
  let distance = 0;
  if (originVenue) {
    const walk = corridorWalk(originCore, originVenue.center);
    distance += pathLength(walk);
    steps.push(
      `From ${shortName(originVenue)}, follow the ${sideOf(originVenue.center)} corridor ${direction(
        originVenue.center,
        originCore
      )} to the ${bankName}.`
    );
  } else {
    steps.push(`Start at the ${bankName} on Deck ${from.deck}.`);
  }

  if (from.deck !== to.deck) {
    distance += Math.abs(from.deck - to.deck) * DECK_HEIGHT_M;
    steps.push(`Take the elevator ${to.deck > from.deck ? 'up' : 'down'} to Deck ${to.deck}.`);
  }

  const finalWalk = corridorWalk(destCore, destVenue.center);
  const finalMetres = pathLength(finalWalk);
  distance += finalMetres;
  steps.push(
    `Head ${direction(destCore, destVenue.center)} along the ${sideOf(destVenue.center)} side about ${Math.max(
      5,
      Math.round(finalMetres / 5) * 5
    )} m to ${destVenue.name}.`
  );

  const distanceMeters = Math.round(distance);
  return {
    id,
    name: `${originVenue ? shortName(originVenue) : bankName} → ${destVenue.name}`,
    origin,
    destination,
    viaBank: bank,
    distanceMeters,
    estimatedMinutes: Math.max(1, Math.ceil(distanceMeters / WALKING_METRES_PER_MINUTE)),
    steps,
  };
}

/** "Stateroom 10124 (Concierge Class)" → "Stateroom 10124". */
function shortName(venue) {
  return venue.name.replace(/\s*\(.*\)\s*$/, '');
}

/**
 * The polyline and end markers to draw for a route on one deck, or null when
 * the route does not touch that deck.
 */
export function routePathForDeck(route, level) {
  if (!route) return null;
  const onOrigin = route.origin.deck === level;
  const onDest = route.destination.deck === level;
  if (!onOrigin && !onDest) return null;

  const segments = [];
  if (onOrigin && route.origin.coords) {
    segments.push(corridorWalk(route.origin.core, route.origin.coords).reverse());
  }
  if (onDest) {
    segments.push(corridorWalk(route.destination.core, route.destination.coords));
  }
  if (segments.length === 0) {
    // Origin deck when starting at the elevators: just mark the lobby.
    segments.push([route.origin.core, route.origin.core]);
  }

  const points = segments.flat();
  return {
    points,
    start: onOrigin && route.origin.coords ? { coords: route.origin.coords, kind: 'origin' } : null,
    elevator: onOrigin ? route.origin.core : route.destination.core,
    end: onDest ? { coords: route.destination.coords, kind: 'destination' } : null,
  };
}
