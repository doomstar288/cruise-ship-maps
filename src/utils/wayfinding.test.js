import { describe, it, expect } from 'vitest';
import { CELEBRITY_XCEL_DECKS } from '../data/celebrityXcelData';
import { CELEBRITY_XCEL_ROUTER, SAMPLE_ROUTE_SPECS, routeFor } from '../data/celebrityXcelRoutes';
import { routePathForDeck } from './wayfinding';

const deckAt = (level) => CELEBRITY_XCEL_DECKS.find((d) => d.level === level);
const venueOn = (level, id) => deckAt(level).venues.find((v) => v.id === id);
const graphPoints = new Set(CELEBRITY_XCEL_ROUTER.nodes.map((n) => `${n.deck}:${n.at}`));

describe.each([false, true])('preset routes (stepFree: %s)', (stepFree) => {
  const routes = SAMPLE_ROUTE_SPECS.map((spec) => [spec.id, spec, routeFor(spec, { stepFree })]);

  it.each(routes)('%s runs from its origin cabin to its destination venue', (id, spec, route) => {
    expect(route.origin).toMatchObject({ deck: spec.from.deck });
    expect(route.destination).toMatchObject({
      deck: spec.to.deck,
      name: venueOn(spec.to.deck, spec.to.venueId).name,
    });
    // A cabin end starts at the cabin itself; a venue end at one of its doors.
    expect(route.origin.coords).toEqual(venueOn(spec.from.deck, spec.from.venueId).center);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.estimatedMinutes).toBeGreaterThanOrEqual(
      Math.ceil(route.distanceMeters / 1.1 / 60)
    );
    expect(route.steps.length).toBeGreaterThanOrEqual(3);
    expect(route.decks[0]).toBe(spec.from.deck);
    expect(route.decks).toContain(spec.to.deck);
    if (stepFree) expect(route.legs.some((l) => l.kind === 'stairs')).toBe(false);
  });

  it.each(routes)('%s walks only along the routing graph', (id, spec, route) => {
    const walks = route.legs.filter((l) => l.kind === 'walk');
    walks.forEach((leg, i) => {
      // Only the cabin snap at the very start may be off the graph.
      const inner = i === 0 ? leg.points.slice(1) : leg.points;
      for (const p of inner)
        expect(graphPoints.has(`${leg.deck}:${p}`), `${leg.deck}:${p}`).toBe(true);
    });
  });

  it.each(routes)('%s draws on exactly the decks it visits', (id, spec, route) => {
    for (const deck of CELEBRITY_XCEL_DECKS) {
      const path = routePathForDeck(route, deck.level);
      expect(Boolean(path), `Deck ${deck.level}`).toBe(route.decks.includes(deck.level));
    }
    const origin = routePathForDeck(route, spec.from.deck);
    expect(origin.start.coords).toEqual(route.origin.coords);
    expect(origin.landings.length).toBeGreaterThan(0);
    const destination = routePathForDeck(route, spec.to.deck);
    expect(destination.end.coords).toEqual(route.destination.coords);
    expect(destination.segments.length).toBeGreaterThan(0);
  });
});

describe("routes from a deck's elevators", () => {
  it('starts at the nearest lobby with no "A" marker and reaches a connector venue', () => {
    const route = routeFor({
      id: 'spice',
      from: { deck: 5 },
      to: { deck: 5, venueId: 'v5-spice-cafe' },
    });
    expect(route.origin.coords).toBeNull();
    expect(route.deckChanges).toEqual([]);
    expect(route.steps).toEqual([
      expect.stringMatching(
        /^From the .+ Elevators on Deck 5, walk about \d+ m .*through Market at The Bazaar to Spice Café\.$/
      ),
    ]);
    const path = routePathForDeck(route, 5);
    expect(path.start).toBeNull();
    expect(path.end.coords).toEqual(route.destination.coords);
  });

  it('goes via a lift for a venue in another walk section of the same deck', () => {
    const route = routeFor(
      {
        id: 'split',
        from: { deck: 4, venueId: 'v4-le-voyage' },
        to: { deck: 4, venueId: 'v4-theatre' },
      },
      { stepFree: true }
    );
    expect(route.deckChanges).toHaveLength(2);
    expect(route.steps.filter((s) => s.startsWith('Take the'))).toHaveLength(2);
    expect(routePathForDeck(route, 4).segments).toHaveLength(2);
  });

  it('refuses features that are not on the graph', () => {
    const crew = deckAt(2).venues.find(
      (v) => !CELEBRITY_XCEL_ROUTER.hasFeature(v.id) && !/stateroom|suite/i.test(v.category)
    );
    expect(() =>
      routeFor({ id: 'crew', from: { deck: 2 }, to: { deck: 2, venueId: crew.id } })
    ).toThrow(/not on the routing graph/);
  });
});
