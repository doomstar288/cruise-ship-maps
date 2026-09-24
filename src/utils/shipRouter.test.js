import { describe, it, expect } from 'vitest';
import { ROUTE_COSTS, createRouter, expandRouting } from './shipRouter';

/*
 * A three-deck toy ship (Decks 1, 2 and 4; no Deck 3). Each deck is a straight
 * corridor along y = 0 with a lift lobby at x = 0 and a stair-only landing at
 * x = 100. Deck 2 also has two doors for one venue and a walk section at
 * x = 200 that only a lift reaches. Deck 4's corridor runs on to a second lift
 * bank and a rooftop venue.
 */
const deck = (deckNumber, extraNodes = [], extraWalk = []) => ({
  deckNumber,
  nodes: [
    [0, 0, 'elevator_lobby', `lift-a-${deckNumber}`],
    [100, 0, 'stair', `stair-${deckNumber}`],
    [50, 0],
    ...extraNodes,
  ],
  walk: [[0, 2, 50], [1, 2, 50], ...extraWalk],
});

const routing = {
  walkingSpeedMps: 1,
  decks: [
    deck(1),
    deck(
      2,
      [
        [30, 0, 'entrance', 'bar', 0],
        [90, 0, 'entrance', 'bar', 'projected'],
        [200, 0, 'elevator_lobby', 'lift-b-2'],
        [230, 0, 'entrance', 'far-venue', 0],
        [215, 0],
        [70, 0],
      ],
      [
        [3, 2, 20],
        [5, 7, 15],
        [6, 7, 15, 'far-hall'],
        [2, 8, 20],
        [4, 8, 20],
      ]
    ),
    deck(
      4,
      [
        [300, 0, 'elevator_lobby', 'lift-b-4'],
        [320, 0, 'entrance', 'rooftop', 0],
      ],
      [
        [2, 3, 250],
        [3, 4, 20],
      ]
    ),
  ],
  elevators: [
    { bank: 'a', stops: ['lift-a-1', 'lift-a-2', 'lift-a-4'] },
    { bank: 'b', stops: ['lift-b-2', 'lift-b-4'] },
  ],
  stairs: [['stair-1', 'stair-2', 'stair-4']],
};

const router = createRouter(routing);

describe('expandRouting', () => {
  const { nodes, edges } = expandRouting(routing);

  it('joins every pair of lift stops and neighbouring stair stops, counting levels not deck numbers', () => {
    const lifts = edges
      .filter((e) => e.kind === 'elevator')
      .map((e) => [e.from, e.to, e.decks, e.bank]);
    expect(lifts).toEqual([
      ['1:0', '2:0', 1, 'a'],
      ['1:0', '4:0', 2, 'a'],
      ['2:0', '4:0', 1, 'a'],
      ['2:5', '4:3', 1, 'b'],
    ]);
    const stairs = edges.filter((e) => e.kind === 'stairs');
    expect(stairs.map((e) => [e.from, e.to, e.decks, e.stepFree])).toEqual([
      ['1:1', '2:1', 1, false],
      ['2:1', '4:1', 1, false],
    ]);
  });

  it('accepts a whole pack as well as the routing block', () => {
    expect(expandRouting({ routing })).toEqual({ nodes, edges });
  });

  it('marks authored and projected doors', () => {
    const doors = nodes.filter((n) => n.kind === 'entrance' && n.featureId === 'bar');
    expect(doors.map((d) => [d.entrance, d.projected])).toEqual([
      [0, undefined],
      [undefined, true],
    ]);
  });
});

describe('createRouter().route', () => {
  it('walks when the target is on the same walk section', () => {
    const route = router.route({ featureId: 'lift-a-2' }, { featureId: 'bar' });
    expect(route.deckChanges).toEqual([]);
    // The nearer of the bar's two doors wins: 50 + 20 m to the door at x = 30.
    expect(route.walkM).toBe(70);
    expect(route.destination).toMatchObject({ deck: 2, featureId: 'bar', node: '2:3' });
    expect(route.legs).toEqual([
      {
        kind: 'walk',
        deck: 2,
        points: [
          [0, 0],
          [50, 0],
          [30, 0],
        ],
        lengthM: 70,
        through: [],
      },
    ]);
  });

  it('takes stairs for one flight and the lift once stairs cost more than the wait', () => {
    const oneFlight = router.route({ featureId: 'stair-1' }, { featureId: 'stair-2' });
    expect(oneFlight.deckChanges).toEqual([{ mode: 'stairs', fromDeck: 1, toDeck: 2 }]);
    expect(oneFlight.timeS).toBe(ROUTE_COSTS.stairsPerLevelS);

    const liftToLift = router.route({ featureId: 'lift-a-1' }, { featureId: 'lift-a-4' });
    expect(liftToLift.deckChanges).toEqual([{ mode: 'elevator', fromDeck: 1, toDeck: 4 }]);
    expect(liftToLift.timeS).toBe(ROUTE_COSTS.elevatorBoardS + 2 * ROUTE_COSTS.elevatorPerLevelS);
    expect(liftToLift.legs).toEqual([
      expect.objectContaining({
        kind: 'elevator',
        bank: 'a',
        from: 'lift-a-1',
        to: 'lift-a-4',
        levels: 2,
      }),
    ]);
  });

  it('merges consecutive flights into one deck change and keeps the landing walk', () => {
    const route = router.route({ featureId: 'stair-1' }, { featureId: 'rooftop' });
    expect(route.deckChanges).toEqual([{ mode: 'stairs', fromDeck: 1, toDeck: 4 }]);
    expect(route.legs.map((l) => l.kind)).toEqual(['stairs', 'walk']);
    expect(route.legs[0]).toMatchObject({ from: 'stair-1', to: 'stair-4', levels: 2 });
    expect(route.legs[1]).toMatchObject({
      deck: 4,
      points: [
        [100, 0],
        [50, 0],
        [300, 0],
        [320, 0],
      ],
    });
  });

  it('never uses stairs when step-free', () => {
    const route = router.route(
      { featureId: 'stair-1' },
      { featureId: 'rooftop' },
      { stepFree: true }
    );
    expect(route.legs.some((l) => l.kind === 'stairs')).toBe(false);
    expect(route.deckChanges).toEqual([{ mode: 'elevator', fromDeck: 1, toDeck: 4 }]);
  });

  it('reaches a lift-only walk section on the same deck via another deck', () => {
    const route = router.route(
      { featureId: 'bar' },
      { featureId: 'far-venue' },
      { stepFree: true }
    );
    expect(route.deckChanges).toEqual([
      { mode: 'elevator', fromDeck: 2, toDeck: 4 },
      { mode: 'elevator', fromDeck: 4, toDeck: 2 },
    ]);
    expect(route.legs.at(-1)).toMatchObject({ deck: 2, through: ['far-hall'], lengthM: 30 });
  });

  it('snaps a point to the nearest corridor node and walks the snap', () => {
    const route = router.route({ deck: 1, at: [55, 4] }, { featureId: 'lift-a-1' });
    expect(route.origin).toMatchObject({
      node: '1:2',
      snapM: Math.round(Math.hypot(5, 4) * 100) / 100,
    });
    expect(route.walkM).toBeCloseTo(50 + Math.hypot(5, 4), 2);
    expect(route.legs[0].points[0]).toEqual([55, 4]);
  });

  it('starts from the best lobby on a deck', () => {
    const route = router.route({ deck: 2, elevators: true }, { featureId: 'far-venue' });
    expect(route.origin.featureId).toBe('lift-b-2');
    expect(route.walkM).toBe(30);
  });

  it('returns null when no route exists and throws for ends off the graph', () => {
    const island = createRouter({
      ...routing,
      decks: routing.decks.map((d) => (d.deckNumber === 4 ? { ...d, walk: [] } : d)),
    });
    expect(island.route({ featureId: 'lift-a-1' }, { featureId: 'rooftop' })).toBeNull();
    expect(() => router.route({ featureId: 'nowhere' }, { featureId: 'bar' })).toThrow(
      /not on the routing graph/
    );
    expect(() => router.route({}, { featureId: 'bar' })).toThrow(/needs featureId/);
  });

  it('is symmetric in length and deck count', () => {
    const there = router.route({ featureId: 'bar' }, { featureId: 'rooftop' });
    const back = router.route({ featureId: 'rooftop' }, { featureId: 'bar' });
    expect(back.walkM).toBe(there.walkM);
    expect(back.timeS).toBe(there.timeS);
    expect(back.deckChanges.map((c) => [c.toDeck, c.fromDeck]).reverse()).toEqual(
      there.deckChanges.map((c) => [c.fromDeck, c.toDeck])
    );
  });
});

describe('createRouter().routeToNearest', () => {
  it('returns the cheapest candidate and the route route() gives to it', () => {
    const from = { featureId: 'lift-a-1' };
    // The bar is one lift ride up (68 s) and a 70 m walk; the rooftop is two rides up and 320 m.
    const nearest = router.routeToNearest(from, ['rooftop', 'bar']);
    expect(nearest.featureId).toBe('bar');
    expect(nearest.route).toEqual(router.route(from, { featureId: 'bar' }));
    expect(nearest.route.deckChanges).toEqual([{ mode: 'elevator', fromDeck: 1, toDeck: 2 }]);
    expect(nearest.route.timeS).toBe(138);
  });

  it('breaks a tie by list order, not by where the candidates sit in the graph', () => {
    // One lift ride down or up: both 68 s from Deck 2.
    const from = { featureId: 'lift-a-2' };
    const down = router.routeToNearest(from, ['lift-a-1', 'lift-a-4']);
    const up = router.routeToNearest(from, ['lift-a-4', 'lift-a-1']);
    expect([down.featureId, up.featureId]).toEqual(['lift-a-1', 'lift-a-4']);
    expect(down.route.timeS).toBe(68);
    expect(up.route).toEqual(router.route(from, { featureId: 'lift-a-4' }));
  });

  it('honours stepFree, which can change the winner', () => {
    const from = { featureId: 'stair-1' };
    const candidates = ['stair-2', 'lift-a-1'];
    expect(router.routeToNearest(from, candidates).featureId).toBe('stair-2');
    const stepFree = router.routeToNearest(from, candidates, { stepFree: true });
    expect(stepFree.featureId).toBe('lift-a-1');
    expect(stepFree.route).toEqual(
      router.route(from, { featureId: 'lift-a-1' }, { stepFree: true })
    );
  });

  it('takes a venue at its nearest door and snaps a point origin, as route() does', () => {
    const from = { deck: 2, at: [72, 3] };
    const nearest = router.routeToNearest(from, ['bar', 'far-venue']);
    expect(nearest.featureId).toBe('bar');
    expect(nearest.route).toEqual(router.route(from, { featureId: 'bar' }));
    expect(nearest.route.destination.node).toBe('2:4');
  });

  it('counts an origin that is also a candidate, at no cost', () => {
    const nearest = router.routeToNearest({ featureId: 'bar' }, ['lift-a-2', 'bar']);
    expect(nearest.featureId).toBe('bar');
    expect(nearest.route).toMatchObject({ walkM: 0, timeS: 0, legs: [], deckChanges: [] });
  });

  it('skips unreachable candidates, returns null when none is left, and throws off the graph', () => {
    const island = createRouter({
      ...routing,
      decks: routing.decks.map((d) => (d.deckNumber === 4 ? { ...d, walk: [] } : d)),
    });
    const from = { featureId: 'lift-a-1' };
    expect(island.routeToNearest(from, ['rooftop', 'bar']).featureId).toBe('bar');
    expect(island.routeToNearest(from, ['rooftop'])).toBeNull();
    expect(router.routeToNearest(from, [])).toBeNull();
    expect(router.routeToNearest(from, ['bar', 'bar']).featureId).toBe('bar');
    expect(() => router.routeToNearest(from, ['bar', 'nowhere'])).toThrow(
      /nowhere is not on the routing graph/
    );
  });
});
