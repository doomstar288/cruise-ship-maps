import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { ROUTE_COSTS, createRouter } from '../src/utils/shipRouter.js';
import {
  FIXTURE_TOLERANCE,
  NEAREST_FIXTURE_CASES,
  ROUTE_FIXTURE_CASES,
  fixturesPath,
  packPath,
  routerEndpoint,
  runFixture,
  runNearestFixture,
  withinTolerance,
} from './route-fixtures.mjs';

/**
 * Exact least time from `from` to every node: a plain O(n²) Dijkstra that shares no code
 * with the router, following the cost table in ship_map_pack_routing.md.
 */
function exactTimes({ nodes, edges }, speed, from, stepFree) {
  const index = new Map(nodes.map((n, i) => [n.key, i]));
  const links = nodes.map(() => []);
  for (const edge of edges) {
    const s =
      edge.kind === 'walk'
        ? edge.lengthM / speed
        : edge.kind === 'elevator'
          ? ROUTE_COSTS.elevatorBoardS + ROUTE_COSTS.elevatorPerLevelS * edge.decks
          : ROUTE_COSTS.stairsPerLevelS * edge.decks;
    const [a, b] = [index.get(edge.from), index.get(edge.to)];
    links[a].push({ to: b, s, stairs: edge.kind === 'stairs' });
    links[b].push({ to: a, s, stairs: edge.kind === 'stairs' });
  }
  const time = nodes.map(() => Infinity);
  if (from.featureId !== undefined) {
    nodes.forEach((n, i) => {
      if (n.featureId === from.featureId) time[i] = 0;
    });
  } else if (from.elevators) {
    nodes.forEach((n, i) => {
      if (n.deck === from.deck && n.kind === 'elevator_lobby' && links[i].length) time[i] = 0;
    });
  } else {
    // The cabin snap: the nearest corridor node on the deck, the first one on a tie.
    let snap = null;
    nodes.forEach((n, i) => {
      if (n.deck !== from.deck || n.kind !== 'corridor') return;
      const d = Math.hypot(n.at[0] - from.at[0], n.at[1] - from.at[1]);
      if (!snap || d < snap.d - 1e-9) snap = { i, d };
    });
    time[snap.i] = snap.d / speed;
  }
  const done = nodes.map(() => false);
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i += 1) {
      if (!done[i] && time[i] < Infinity && (u === -1 || time[i] < time[u])) u = i;
    }
    if (u === -1) return time;
    done[u] = true;
    for (const { to, s, stairs } of links[u]) {
      if (!(stepFree && stairs)) time[to] = Math.min(time[to], time[u] + s);
    }
  }
}

/**
 * What routeToNearest must equal: route() to every candidate in turn, keeping the first
 * cheapest. route() rounds timeS to 0.1 s, too coarse to rank near-equal candidates, so
 * they're ranked by exact time instead, after checking it agrees with route().
 */
function routeToEach(router, speed, from, candidates, stepFree) {
  const time = exactTimes(router, speed, from, stepFree);
  let best = null;
  for (const featureId of candidates) {
    const route = router.route(from, { featureId }, { stepFree });
    const exact = Math.min(
      ...router.nodes.flatMap((n, i) => (n.featureId === featureId ? [time[i]] : []))
    );
    expect(route === null, featureId).toBe(exact === Infinity);
    if (!route) continue;
    expect(Math.abs(route.timeS - exact), featureId).toBeLessThan(0.05 + 1e-6);
    if (!best || exact < best.exact - 1e-9) best = { featureId, route, exact };
  }
  return best && { featureId: best.featureId, route: best.route };
}

/** A small seeded generator (mulberry32), so the property test sees the same cases every run. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe.each(Object.keys(ROUTE_FIXTURE_CASES))('route fixtures for %s', (shipId) => {
  // The published files, exactly as a consumer fetches them.
  const pack = JSON.parse(readFileSync(packPath(shipId), 'utf8'));
  const fixtures = JSON.parse(readFileSync(fixturesPath(shipId), 'utf8'));
  const router = createRouter(pack.routing);
  const speed = pack.routing.walkingSpeedMps;
  const cases = ROUTE_FIXTURE_CASES[shipId];
  const nearestCases = NEAREST_FIXTURE_CASES[shipId] ?? [];

  /** A port passes a case when changes and `through` match and lengths are within tolerance. */
  const expectMatch = (actual, expected) => {
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
  };

  it('records the cases, cost model and tolerances this repo defines', () => {
    expect(fixtures).toMatchObject({ specVersion: 1, shipId, tolerance: FIXTURE_TOLERANCE });
    expect(fixtures.costModel).toEqual({
      walkingSpeedMps: pack.routing.walkingSpeedMps,
      ...ROUTE_COSTS,
    });
    expect(fixtures.routes.map(({ expected: _expected, ...c }) => c)).toEqual(
      cases.map((c) => ({ ...c, stepFree: c.stepFree ?? false }))
    );
    expect(fixtures.nearest.map(({ expected: _expected, ...c }) => c)).toEqual(
      nearestCases.map((c) => ({ ...c, stepFree: c.stepFree ?? false }))
    );
    const ids = [...fixtures.routes, ...fixtures.nearest].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names ends that exist in the pack', () => {
    const expectEnd = (end) => {
      if (end.featureId) expect(router.hasFeature(end.featureId), end.featureId).toBe(true);
      else if (end.cabinId) expect(routerEndpoint(pack, end).at).toHaveLength(2);
      else expect(end.elevators).toBe(true);
    };
    for (const { from, to } of fixtures.routes) [from, to].forEach(expectEnd);
    for (const { from, candidates } of fixtures.nearest) {
      expectEnd(from);
      for (const featureId of candidates) expectEnd({ featureId });
    }
  });

  it.each(fixtures.routes.map((r) => [r.id, r]))(
    '%s matches the router within tolerance',
    (id, fixture) => {
      expectMatch(runFixture(router, pack, fixture), fixture.expected);
    }
  );

  it.each(fixtures.nearest.map((n) => [n.id, n]))(
    '%s picks the recorded winner, and the route matches within tolerance',
    (id, fixture) => {
      const actual = runNearestFixture(router, pack, fixture);
      expect(actual?.featureId).toBe(fixture.expected.featureId);
      expectMatch(actual, fixture.expected);
    }
  );

  it('makes each nearest winner the cheapest candidate, ties going to the one listed first', () => {
    for (const { id, from, candidates, stepFree } of fixtures.nearest) {
      const origin = routerEndpoint(pack, from);
      const nearest = router.routeToNearest(origin, candidates, { stepFree });
      expect(nearest, id).toEqual(routeToEach(router, speed, origin, candidates, stepFree));
    }
  });

  it('routeToNearest matches routing to every candidate, over many origins and candidate sets', () => {
    const random = seeded(56);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const features = pack.decks.flatMap((d) =>
      d.features.map((f) => ({ ...f, deck: d.deckNumber }))
    );
    const cabins = features.filter((f) => f.featureType === 'cabin');
    const targets = features.filter((f) => router.hasFeature(f.id));
    const lobbies = targets.filter((f) => f.featureType === 'elevator');
    const bankOf = (f) => f.id.replace(/-\d+$/, '');
    const trials = [
      // A cabin to any features on the graph.
      () => {
        const cabin = pick(cabins);
        const count = 1 + Math.floor(random() * 12);
        return {
          from: { deck: cabin.deck, at: cabin.center },
          candidates: Array.from({ length: count }, () => pick(targets).id),
        };
      },
      // A venue or landing, sometimes listed among its own candidates.
      () => {
        const count = 1 + Math.floor(random() * 12);
        return {
          from: { featureId: pick(targets).id },
          candidates: Array.from({ length: count }, () => pick(targets).id),
        };
      },
      // Any lobby on a deck to venues.
      () => {
        const venues = targets.filter((f) => f.featureType === 'venue');
        const count = 1 + Math.floor(random() * 12);
        return {
          from: { deck: pick(pack.routing.decks).deckNumber, elevators: true },
          candidates: Array.from({ length: count }, () => pick(venues).id),
        };
      },
      // A lobby to the other stops of its bank, shuffled: the decks above and below tie.
      () => {
        const lobby = pick(lobbies);
        const bank = lobbies.filter((f) => bankOf(f) === bankOf(lobby) && f.id !== lobby.id);
        return {
          from: { featureId: lobby.id },
          candidates: bank
            .map((f) => [random(), f.id])
            .sort((a, b) => a[0] - b[0])
            .map(([, id]) => id),
        };
      },
    ];

    const seen = { offDeck: 0, ties: 0, stepFree: 0 };
    for (let i = 0; i < 400; i += 1) {
      const { from, candidates } = trials[i % trials.length]();
      const stepFree = random() < 0.5;
      const nearest = router.routeToNearest(from, candidates, { stepFree });
      const reference = routeToEach(router, speed, from, candidates, stepFree);
      expect(nearest, JSON.stringify({ from, candidates, stepFree })).toEqual(reference);
      if (!nearest) continue;
      const { origin, destination, timeS } = nearest.route;
      if (origin.deck !== destination.deck) seen.offDeck += 1;
      if (stepFree) seen.stepFree += 1;
      const tied = new Set(
        candidates.filter(
          (id) => router.route(from, { featureId: id }, { stepFree })?.timeS === timeS
        )
      );
      if (tied.size > 1) seen.ties += 1;
    }
    // The seeded cases really exercise winners on other decks, step-free and ties.
    expect(seen.offDeck).toBeGreaterThan(200);
    expect(seen.stepFree).toBeGreaterThan(150);
    expect(seen.ties).toBeGreaterThan(50);
  });

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

  it('covers what a nearest port has to get right', () => {
    const all = fixtures.nearest;
    const offDeck = ({ deckChanges: c }) => c.length > 0 && c[0].fromDeck !== c.at(-1).toDeck;
    expect(all.some((n) => offDeck(n.expected))).toBe(true);
    expect(all.some((n) => n.from.cabinId)).toBe(true);
    expect(all.some((n) => n.from.featureId)).toBe(true);
    expect(all.some((n) => n.from.elevators)).toBe(true);
    const twinOf = (n) => all.find((m) => m.id === n.id.replace(/-step-free$/, ''));
    // Step-free changes the winner.
    expect(
      all.some(
        (n) => n.stepFree && twinOf(n) && twinOf(n).expected.featureId !== n.expected.featureId
      )
    ).toBe(true);
    // A tie that list order decides: the same list reversed, a different winner, the same time.
    expect(
      all.some((n) =>
        all.some(
          (m) =>
            JSON.stringify(m.from) === JSON.stringify(n.from) &&
            m.stepFree === n.stepFree &&
            m.candidates.join() === [...n.candidates].reverse().join() &&
            m.expected.featureId !== n.expected.featureId &&
            m.expected.timeS === n.expected.timeS
        )
      )
    ).toBe(true);
    // Every restroom in the pack, as a "nearest restroom" lists them.
    const restrooms = pack.decks
      .flatMap((d) => d.features.filter((f) => f.category === 'Restrooms'))
      .map((f) => f.id)
      .sort();
    expect(restrooms.length).toBeGreaterThan(0);
    expect(all.some((n) => [...n.candidates].sort().join() === restrooms.join())).toBe(true);
    // A runner-up slower, but within the time tolerance: only exact ranking picks the winner.
    expect(
      all.some(({ from, candidates, stepFree, expected }) => {
        const origin = routerEndpoint(pack, from);
        return candidates.some((featureId) => {
          const other = router.route(origin, { featureId }, { stepFree });
          return (
            other?.timeS > expected.timeS &&
            withinTolerance(other.timeS, expected.timeS, fixtures.tolerance.timeS)
          );
        });
      })
    ).toBe(true);
  });

  it('holds a step-free twin to never be cheaper than its stairs-allowed trip', () => {
    for (const list of [fixtures.routes, fixtures.nearest]) {
      for (const twin of list.filter((r) => r.stepFree)) {
        const plain = list.find((r) => r.id === twin.id.replace(/-step-free$/, ''));
        if (!plain) continue;
        expect(plain.expected.timeS).toBeLessThanOrEqual(twin.expected.timeS);
      }
    }
  });
});
