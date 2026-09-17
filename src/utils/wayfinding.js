/**
 * Wayfinding for the maps site, over the pack's routing graph (roadmap P2.4).
 *
 * The route itself comes from `shipRouter.js`, the same graph and router the
 * published pack and AuraTrip use. This module only maps site venues to graph
 * endpoints and turns a route into step text and per-deck drawing data.
 */

const CABIN_CATEGORY = /^(staterooms?|suites?)$/i;

const findDeck = (decks, level) => decks.find((d) => d.level === level);
const findVenue = (decks, id) => {
  for (const deck of decks) {
    const venue = deck.venues.find((v) => v.id === id);
    if (venue) return venue;
  }
  return null;
};

/** "Stateroom 10124 (Concierge Class)" → "Stateroom 10124". */
const shortName = (name) => name.replace(/\s*\(.*\)\s*$/, '');

/** The router endpoint for a site venue, or throws when it can't be routed to. */
function endpointFor(decks, router, { deck, venueId }) {
  if (!venueId) return { endpoint: { deck, elevators: true }, venue: null };
  const venue = findDeck(decks, deck)?.venues.find((v) => v.id === venueId);
  if (!venue) throw new Error(`Deck ${deck} has no venue ${venueId}`);
  if (router.hasFeature(venueId)) return { endpoint: { featureId: venueId }, venue };
  // Cabins have no nodes: they snap to their corridor (see the routing doc).
  if (CABIN_CATEGORY.test(venue.category ?? '')) {
    return { endpoint: { deck, at: venue.center, cabinId: venueId }, venue };
  }
  throw new Error(`${venue.name} is not on the routing graph`);
}

const roundTo5 = (m) => Math.max(5, Math.round(m / 5) * 5);

/** Smaller x is forward; a walk that barely moves fore-aft gets no direction. */
function heading(points) {
  const dx = points[points.length - 1][0] - points[0][0];
  if (dx < -5) return ' forward';
  if (dx > 5) return ' aft';
  return '';
}

const upOrDown = (leg) => (leg.toDeck > leg.fromDeck ? 'up' : 'down');

function stepsFor(route, name, originName, destinationName) {
  const { legs } = route;
  if (legs.length === 0) return [`You're already at ${destinationName}.`];

  const steps = [];
  if (legs[0].kind !== 'walk')
    steps.push(`Start at the ${name(legs[0].from)} on Deck ${legs[0].fromDeck}.`);
  legs.forEach((leg, i) => {
    if (leg.kind === 'walk') {
      const next = legs[i + 1];
      const target = next ? `the ${name(next.from)}` : destinationName;
      const prefix = i === 0 ? `From ${originName}` : `On Deck ${leg.deck}`;
      const through = leg.through.length ? ` through ${leg.through.map(name).join(' and ')}` : '';
      steps.push(
        `${prefix}, walk about ${roundTo5(leg.lengthM)} m${heading(leg.points)}${through} to ${target}.`
      );
    } else if (leg.kind === 'elevator') {
      steps.push(`Take the ${name(leg.from)} ${upOrDown(leg)} to Deck ${leg.toDeck}.`);
    } else {
      const decks = leg.levels === 1 ? 'one deck' : `${leg.levels} decks`;
      steps.push(`Take the stairs ${upOrDown(leg)} ${decks} to Deck ${leg.toDeck}.`);
    }
  });
  const last = legs[legs.length - 1];
  if (last.kind !== 'walk') steps.push(`Arrive at ${destinationName}.`);
  return steps;
}

/**
 * Build a route between two venues, or from a deck's elevators to a venue.
 * @param {Array} decks - site deck records
 * @param {object} router - from `createRouter(pack.routing)`
 * @param {object} spec
 * @param {string} spec.id
 * @param {{deck: number, venueId?: string}} spec.from - omit venueId to start at the nearest elevators
 * @param {{deck: number, venueId: string}} spec.to
 * @param {{stepFree?: boolean}} [options] - step-free routes never use stairs
 */
export function buildRoute(decks, router, { id, from, to }, { stepFree = false } = {}) {
  const origin = endpointFor(decks, router, from);
  const destination = endpointFor(decks, router, to);
  const route = router.route(origin.endpoint, destination.endpoint, { stepFree });
  if (!route)
    throw new Error(`Route ${id} has no path from Deck ${from.deck} to ${destination.venue.name}`);

  const name = (featureId) => findVenue(decks, featureId)?.name ?? featureId;
  const originName = origin.venue
    ? shortName(origin.venue.name)
    : `${name(route.origin.featureId)} (Deck ${route.origin.deck})`;
  const destinationName = destination.venue.name;

  const firstPoint = route.legs.find((l) => l.kind === 'walk')?.points[0] ?? route.legs[0]?.fromAt;
  const lastWalk = route.legs.findLast((l) => l.kind === 'walk');
  const lastPoint = lastWalk?.points[lastWalk.points.length - 1] ?? route.legs.at(-1)?.toAt;
  const visited = route.legs.flatMap((l) =>
    l.kind === 'walk' ? [l.deck] : [l.fromDeck, l.toDeck]
  );

  return {
    id,
    name: `${originName} → ${destinationName}`,
    stepFree,
    // Starting at the elevators draws the lift pin, not an "A" marker.
    origin: { deck: route.origin.deck, name: originName, coords: origin.venue ? firstPoint : null },
    destination: { deck: route.destination.deck, name: destinationName, coords: lastPoint ?? null },
    decks: [...new Set([route.origin.deck, ...visited, route.destination.deck])],
    legs: route.legs,
    deckChanges: route.deckChanges,
    distanceMeters: Math.round(route.walkM),
    estimatedMinutes: Math.max(1, Math.ceil(route.timeS / 60)),
    steps: stepsFor(
      route,
      name,
      origin.venue
        ? originName
        : `the ${name(route.origin.featureId)} on Deck ${route.origin.deck}`,
      destinationName
    ),
  };
}

/**
 * What to draw for a route on one deck: walk polylines, lift and stair
 * landings, and the end markers. Null when the route doesn't touch the deck.
 */
export function routePathForDeck(route, level) {
  if (!route) return null;
  const segments = route.legs
    .filter((l) => l.kind === 'walk' && l.deck === level)
    .map((l) => l.points);

  const landings = [];
  for (const leg of route.legs) {
    if (leg.kind === 'walk') continue;
    for (const [deck, coords] of [
      [leg.fromDeck, leg.fromAt],
      [leg.toDeck, leg.toAt],
    ]) {
      if (deck !== level) continue;
      if (landings.some((l) => l.coords[0] === coords[0] && l.coords[1] === coords[1])) continue;
      landings.push({ coords, kind: leg.kind });
    }
  }

  const start =
    route.origin.deck === level && route.origin.coords
      ? { coords: route.origin.coords, kind: 'origin' }
      : null;
  const end =
    route.destination.deck === level && route.destination.coords
      ? { coords: route.destination.coords, kind: 'destination' }
      : null;
  if (segments.length === 0 && landings.length === 0 && !start && !end) return null;
  return { segments, landings, start, end };
}
