import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';

import { ACCESS_BARS_ENTRY, SHIPS, SPEC_VERSION, buildPack } from './export-ship-packs.mjs';
import {
  CABIN_COVER_M,
  MAX_CORRIDOR_NODE_SPACING_M,
  ROUTING_CONNECTORS,
  buildRouting,
  expandRouting,
  isRoutableTarget,
  segmentEntersRect,
} from './routing-graph.mjs';
import { distanceToRing, insidePolygon, isCirculation } from './venue-entrances.mjs';
import { createRouter } from '../src/utils/shipRouter.js';

const pack = buildPack(SHIPS[0].metadata, SHIPS[0].decks);
const graph = expandRouting(pack);
const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
const deckOf = new Map(pack.decks.map((d) => [d.deckNumber, d]));
const featureOn = (deckNumber, id) => deckOf.get(deckNumber).features.find((f) => f.id === id);
const walkEdges = graph.edges.filter((e) => e.kind === 'walk');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const rectOf = ({ bounds: [[x1, y1], [x2, y2]] }) => ({
  x1: Math.min(x1, x2),
  y1: Math.min(y1, y2),
  x2: Math.max(x1, x2),
  y2: Math.max(y1, y2),
});

/** Keys reachable from `start` over edges that `use` accepts (the Xcel graph's, by default). */
function reachable(start, use = () => true, edges = graph.edges) {
  const adjacency = new Map();
  for (const e of edges.filter(use)) {
    for (const [a, b] of [
      [e.from, e.to],
      [e.to, e.from],
    ]) {
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a).push(b);
    }
  }
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const next of adjacency.get(queue.pop()) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Hash of everything in a pack except `routing`, `revision` and `updatedAt`. */
const nonRoutingHash = ({ routing: _r, revision: _v, updatedAt: _u, ...rest }) =>
  createHash('sha256').update(JSON.stringify(rest)).digest('hex');

describe('segmentEntersRect', () => {
  const r = { x1: 0, y1: 0, x2: 10, y2: 10 };
  it('sees a segment crossing the interior', () => {
    expect(segmentEntersRect([-1, 5], [11, 5], r)).toBe(true);
  });
  it('lets a segment run along an edge or stop on it', () => {
    expect(segmentEntersRect([-1, 10], [11, 10], r)).toBe(false);
    expect(segmentEntersRect([-5, 5], [0, 5], r)).toBe(false);
  });
});

describe('routing in the published Celebrity Xcel pack', () => {
  it('is additive: specVersion stays 1 and nothing outside routing changed', () => {
    expect(pack.specVersion).toBe(SPEC_VERSION);
    expect(SPEC_VERSION).toBe(1);
    // Recorded from main at 0b0ae00, before routing existed, and re-recorded when
    // P7.1 added `access` and when P7.3 tagged the gangway and tender platform with
    // `portExit` and their port-day aliases (routing unchanged both times), and when
    // P7.5 added the 13 restroom `poi` features on Decks 2–5, 14 and 15. Aliases,
    // spans, confidence, entrances, access, port exits and restrooms are all inside
    // this hash. Update it only in a change that means to edit deck data, never to
    // make routing pass.
    expect(nonRoutingHash(pack)).toBe(
      '48e9d89b9ef83cdb2da9ab7a234ab7d243792c68df75e0cde3f39a42cca9312c'
    );
  });

  it('matches the committed plan.json, so the export is current and byte-stable', () => {
    const committed = JSON.parse(readFileSync('public/v1/ships/celebrity-xcel/plan.json', 'utf8'));
    expect(committed.revision).toBe(pack.revision);
    expect(committed.routing).toEqual(pack.routing);
  });

  it('has one routing deck per pack deck, in order', () => {
    expect(pack.routing.walkingSpeedMps).toBe(1.1);
    expect(pack.routing.decks.map((d) => d.deckNumber)).toEqual(
      pack.decks.map((d) => d.deckNumber)
    );
  });

  it('writes nodes and edges as the documented tuples, rounded to 2 dp', () => {
    const twoDp = (n) => Number.isFinite(n) && Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
    for (const { deckNumber, nodes, walk } of pack.routing.decks) {
      for (const node of nodes) {
        expect(twoDp(node[0]) && twoDp(node[1]), `${deckNumber} ${node}`).toBe(true);
        if (node.length === 2) continue;
        expect(['elevator_lobby', 'stair', 'entrance']).toContain(node[2]);
        expect(node).toHaveLength(node[2] === 'entrance' ? 5 : 4);
      }
      for (const edge of walk) {
        expect(edge.length === 3 || edge.length === 4, `${deckNumber} ${edge}`).toBe(true);
        expect(Number.isInteger(edge[0]) && Number.isInteger(edge[1]) && edge[0] < edge[1]).toBe(
          true
        );
        expect(twoDp(edge[2])).toBe(true);
      }
    }
  });

  it('has no dangling, duplicate or isolated edges and nodes', () => {
    const keys = new Set();
    for (const e of graph.edges) {
      expect(byKey.has(e.from) && byKey.has(e.to), `${e.from}–${e.to}`).toBe(true);
      expect(e.from).not.toBe(e.to);
      const key = [e.kind, ...[e.from, e.to].sort()].join(' ');
      expect(keys.has(key), key).toBe(false);
      keys.add(key);
    }
    for (const e of walkEdges) expect(byKey.get(e.from).deck).toBe(byKey.get(e.to).deck);
    // A lift may stop where there is nowhere to walk (Deck 2 aft opens only onto
    // crew space); every other node is on a walk edge.
    const touched = new Set(walkEdges.flatMap((e) => [e.from, e.to]));
    const isolated = graph.nodes.filter((n) => !touched.has(n.key));
    expect(isolated.filter((n) => n.kind !== 'elevator_lobby').map((n) => n.key)).toEqual([]);
    expect(isolated.map((n) => n.featureId)).toEqual(['elev-aft-2']);
  });

  it('gives every walk edge its straight-line length (±0.05 m)', () => {
    for (const e of walkEdges) {
      const length = dist(byKey.get(e.from).at, byKey.get(e.to).at);
      expect(Math.abs(e.lengthM - length), `${e.from}–${e.to}`).toBeLessThanOrEqual(0.05);
    }
  });

  it('keeps every node inside its deck hull', () => {
    for (const n of graph.nodes) {
      expect(insidePolygon(n.at, deckOf.get(n.deck).outline), `${n.key} at ${n.at}`).toBe(true);
    }
  });

  it('never walks through the hull, a venue, a cabin or crew space', () => {
    // Sampled every 10 cm. A point counts as inside a feature only 1 cm past its
    // boundary, so a door on a venue's wall is fine. Only a documented connector
    // may cross the one feature it names.
    const failures = [];
    for (const e of walkEdges) {
      const a = byKey.get(e.from);
      const b = byKey.get(e.to).at;
      const deck = deckOf.get(a.deck);
      const walls = deck.features
        .filter((f) => !isCirculation(f) && f.id !== e.through)
        .map((f) => [f.id, rectOf(f)]);
      const steps = Math.max(1, Math.ceil(dist(a.at, b) / 0.1));
      for (let k = 0; k <= steps; k += 1) {
        const p = [
          a.at[0] + ((b[0] - a.at[0]) * k) / steps,
          a.at[1] + ((b[1] - a.at[1]) * k) / steps,
        ];
        if (!insidePolygon(p, deck.outline) && distanceToRing(p, deck.outline) > 0.01) {
          failures.push(`${e.from}–${e.to} leaves the hull at ${p}`);
          break;
        }
        const hit = walls.find(
          ([, r]) =>
            p[0] > r.x1 + 0.01 && p[0] < r.x2 - 0.01 && p[1] > r.y1 + 0.01 && p[1] < r.y2 - 0.01
        );
        if (hit) {
          failures.push(`${e.from}–${e.to} crosses ${hit[0]} at ${p}`);
          break;
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('only crosses a feature on a documented connector', () => {
    const through = new Set(walkEdges.filter((e) => e.through).map((e) => e.through));
    expect(through).toEqual(new Set(ROUTING_CONNECTORS.map((c) => c.through).filter(Boolean)));
  });

  it('ties every entrance node to a real feature door, or flags it projected', () => {
    for (const n of graph.nodes.filter((node) => node.kind === 'entrance')) {
      const feature = featureOn(n.deck, n.featureId);
      expect(feature, `${n.key} ${n.featureId}`).toBeTruthy();
      expect(isRoutableTarget(feature)).toBe(true);
      if (n.projected) {
        expect(n.entrance).toBeUndefined();
        const r = rectOf(feature);
        const onBoundary =
          n.at[0] >= r.x1 - 0.01 &&
          n.at[0] <= r.x2 + 0.01 &&
          n.at[1] >= r.y1 - 0.01 &&
          n.at[1] <= r.y2 + 0.01;
        // Outboard stops (the Magic Carpet) get their door on the hull edge instead.
        expect(onBoundary || rectOf(feature).y1 >= 38, `${n.key} ${n.featureId} at ${n.at}`).toBe(
          true
        );
      } else {
        expect(feature.entrances?.[n.entrance], `${n.key}`).toEqual(n.at);
      }
    }
  });

  it('gives every guest venue at least one door on the graph', () => {
    const served = new Set(
      graph.nodes.filter((n) => n.kind === 'entrance').map((n) => `${n.deck} ${n.featureId}`)
    );
    const missing = pack.decks.flatMap((d) =>
      d.features
        .filter(isRoutableTarget)
        .map((f) => `${d.deckNumber} ${f.id}`)
        .filter((k) => !served.has(k))
    );
    expect(missing).toEqual([]);
  });

  it('puts one node on every elevator and stairwell, inside its footprint', () => {
    for (const deck of pack.decks) {
      for (const f of deck.features.filter(
        (x) => x.featureType === 'elevator' || x.featureType === 'stairwell'
      )) {
        const nodes = graph.nodes.filter(
          (n) => n.deck === deck.deckNumber && n.featureId === f.id && n.kind !== 'entrance'
        );
        expect(nodes, f.id).toHaveLength(1);
        expect(nodes[0].kind).toBe(f.featureType === 'elevator' ? 'elevator_lobby' : 'stair');
        const r = rectOf(f);
        expect(
          nodes[0].at[0] >= r.x1 &&
            nodes[0].at[0] <= r.x2 &&
            nodes[0].at[1] >= r.y1 &&
            nodes[0].at[1] <= r.y2
        ).toBe(true);
      }
    }
  });

  it('serves exactly the decks each elevator bank and stairwell reaches', () => {
    const decksOf = (stops) => stops.map((id) => Number(id.match(/-(\d+)$/)[1]));
    const banks = Object.fromEntries(pack.routing.elevators.map((e) => [e.bank, decksOf(e.stops)]));
    expect(banks).toEqual({
      fwd: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17],
      mid: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16],
      aft: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15],
    });
    // And those are exactly the elevator features the pack draws.
    for (const [bank, decks] of Object.entries(banks)) {
      const drawn = pack.decks.filter((d) =>
        d.features.some((f) => f.id === `elev-${bank}-${d.deckNumber}`)
      );
      expect(drawn.map((d) => d.deckNumber)).toEqual(decks);
    }
    expect(pack.routing.stairs.map(decksOf)).toContainEqual([7, 8, 9, 10, 11, 12]);
    const stairEdges = graph.edges.filter((e) => e.kind === 'stairs');
    expect(stairEdges.every((e) => e.stepFree === false && e.decks === 1)).toBe(true);
  });

  it('counts levels in pack order, so Deck 12 to 14 is one level', () => {
    const ride = graph.edges.find(
      (e) =>
        e.kind === 'elevator' &&
        byKey.get(e.from).featureId === 'elev-fwd-12' &&
        byKey.get(e.to).featureId === 'elev-fwd-14'
    );
    expect(ride.decks).toBe(1);
  });

  it('puts an elevator lobby in every walk section of every deck', () => {
    for (const n of graph.nodes) {
      const section = [...reachable(n.key, (e) => e.kind === 'walk')].map((k) => byKey.get(k));
      expect(
        section.some((m) => m.kind === 'elevator_lobby'),
        `${n.key} at ${n.at}`
      ).toBe(true);
    }
  });

  it('reaches every guest venue from every elevator bank without stairs', () => {
    const stepFree = (e) => e.kind !== 'stairs';
    const doors = graph.nodes.filter((n) => n.kind === 'entrance');
    for (const lobby of graph.nodes.filter((n) => n.kind === 'elevator_lobby')) {
      const seen = reachable(lobby.key, stepFree);
      const unreached = doors
        .filter((d) => !seen.has(d.key))
        .map((d) => `${d.deck} ${d.featureId}`);
      // Every door, on every deck, including the lobby's own.
      expect(unreached, lobby.featureId).toEqual([]);
    }
  });

  // Rebuilds the whole graph once per connector: seconds each under coverage on CI.
  it('needs every connector: removing any one leaves a venue unreachable', () => {
    for (const connector of ROUTING_CONNECTORS) {
      const problems = [];
      buildRouting([pack.decks.find((d) => d.deckNumber === connector.deck)], {
        connectors: ROUTING_CONNECTORS.filter((c) => c !== connector),
        problem: (message) => problems.push(message),
      });
      expect(problems.length, connector.reason).toBeGreaterThan(0);
    }
  }, 120_000);

  it('keeps a corridor node near every cabin, for the snap rule', () => {
    // Cabins snap to their deck's nearest `corridor` node. The four Deck 15 Edge
    // Villas are the documented exception: their only walkway is the lobby.
    const EXCEPTIONS = new Set(['c15-15100', 'c15-15102', 'c15-15104', 'c15-15106']);
    const far = [];
    for (const deck of pack.decks) {
      const corridor = graph.nodes.filter(
        (n) => n.deck === deck.deckNumber && n.kind === 'corridor'
      );
      for (const cabin of deck.features.filter((f) => f.featureType === 'cabin')) {
        const nearest = Math.min(...corridor.map((n) => dist(n.at, cabin.center)));
        if (nearest > 15 && !EXCEPTIONS.has(cabin.id))
          far.push(`${cabin.id} ${nearest.toFixed(1)} m`);
        if (EXCEPTIONS.has(cabin.id)) expect(nearest).toBeLessThanOrEqual(40);
      }
    }
    expect(far).toEqual([]);
  });

  it(`spaces nodes at most ${MAX_CORRIDOR_NODE_SPACING_M} m apart along walkways near cabins`, () => {
    for (const e of walkEdges) {
      const a = byKey.get(e.from);
      const b = byKey.get(e.to);
      const cabins = deckOf.get(a.deck).features.filter((f) => f.featureType === 'cabin');
      const nearCabin = cabins.some((c) => {
        const [dx, dy] = [b.at[0] - a.at[0], b.at[1] - a.at[1]];
        const t = Math.max(
          0,
          Math.min(
            1,
            ((c.center[0] - a.at[0]) * dx + (c.center[1] - a.at[1]) * dy) / (dx * dx + dy * dy)
          )
        );
        return dist(c.center, [a.at[0] + t * dx, a.at[1] + t * dy]) <= CABIN_COVER_M;
      });
      if (nearCabin)
        expect(e.lengthM, `${e.from}–${e.to}`).toBeLessThanOrEqual(
          MAX_CORRIDOR_NODE_SPACING_M + 0.01
        );
    }
  });
});

// The fleet-wide tests read the committed packs: building all fourteen here would
// take minutes under coverage. The Xcel test above holds the committed pack to the build.
const plans = SHIPS.map(({ metadata }) =>
  JSON.parse(readFileSync(`public/v1/ships/${metadata.id}/plan.json`, 'utf8'))
);

describe('access restrictions on routes, across the published fleet', () => {
  it('never routes through a suite, adults or kids area to a venue other guests may use', () => {
    // A `paid` area may be passed (the Deck 14 Magic Carpet stop is reached along
    // the cabana row); the other values keep guests out altogether.
    const failures = [];
    let restrictedCrossings = 0;
    for (const plan of plans) {
      const router = createRouter(plan.routing);
      const features = plan.decks.flatMap((d) =>
        d.features.map((f) => ({ ...f, deck: d.deckNumber }))
      );
      const byId = new Map(features.map((f) => [f.id, f]));
      // Any deck with a connected lift lobby: a crossing leads into a lobby-less
      // walk section, so every route to a venue inside it takes the same crossing.
      const origin = plan.routing.decks
        .map(({ deckNumber }) => ({ deck: deckNumber, elevators: true }))
        .find((endpoint) => {
          try {
            router.route(endpoint, endpoint);
            return true;
          } catch {
            return false;
          }
        });
      for (const target of features) {
        if (!['venue', 'poi'].includes(target.featureType) || !router.hasFeature(target.id)) continue;
        const route = router.route(origin, { featureId: target.id });
        if (!route) continue; // reachability has its own tests
        for (const id of route.legs.flatMap((leg) => leg.through ?? [])) {
          const access = byId.get(id)?.access;
          if (!ACCESS_BARS_ENTRY.has(access)) continue;
          restrictedCrossings += 1;
          if (target.access !== access) {
            failures.push(`${plan.shipId}: ${target.id} (${target.access ?? 'public'}) via ${id} (${access})`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
    // The Retreat Bar, reached across the Retreat Sundeck, on the three ships
    // that draw it; proves the check sees crossings at all.
    expect(restrictedCrossings).toBeGreaterThan(0);
  });
});

describe('port exits, across the published fleet', () => {
  // Port-day walk times start from the guest's cabin, so every cabin needs a route
  // to every exit, and a step-free one too. A cabin that can't reach one is a gap
  // in the graph to fix, never a case to skip. Routing every pair (~66,000 routes)
  // timed out under coverage on CI, so this searches once from each exit and
  // checks each cabin's snap node; real routes from a cabin per deck confirm it.
  it.each(plans.map((plan) => [plan.shipId, plan]))(
    '%s: every cabin reaches every port exit, step-free included',
    (_shipId, plan) => {
      const { nodes, edges } = expandRouting(plan);
      const router = createRouter(plan.routing);
      const exits = plan.decks.flatMap((d) => d.features.filter((f) => f.portExit));
      expect(exits.map((f) => f.portExit)).toContain('gangway');
      // The snap rule: the nearest corridor node on the cabin's deck, the first in
      // node order on a tie, as the router picks it.
      const cabins = plan.decks.flatMap((d) => {
        const corridor = nodes.filter((n) => n.deck === d.deckNumber && n.kind === 'corridor');
        return d.features
          .filter((f) => f.featureType === 'cabin')
          .map((f) => ({
            id: f.id,
            deck: d.deckNumber,
            at: f.center,
            node: corridor.reduce((best, n) =>
              dist(n.at, f.center) < dist(best.at, f.center) - 1e-9 ? n : best
            ).key,
          }));
      });
      expect(cabins.length).toBeGreaterThan(0);
      const firstOnDeck = cabins.filter((c, i) => i === 0 || cabins[i - 1].deck !== c.deck);
      const unreached = [];
      const routerDisagrees = [];
      for (const exit of exits) {
        const doors = nodes.filter((n) => n.featureId === exit.id);
        expect(doors.length, exit.id).toBeGreaterThan(0);
        for (const stepFree of [false, true]) {
          const trip = (cabin) => `${cabin.id} → ${exit.id}${stepFree ? ' (step-free)' : ''}`;
          const use = (e) => !stepFree || e.kind !== 'stairs';
          const seen = new Set(doors.flatMap((n) => [...reachable(n.key, use, edges)]));
          for (const cabin of cabins) if (!seen.has(cabin.node)) unreached.push(trip(cabin));
          for (const cabin of firstOnDeck) {
            const origin = router.route(cabin, { featureId: exit.id }, { stepFree })?.origin.node;
            if (origin !== cabin.node) routerDisagrees.push(`${trip(cabin)}: ${origin ?? 'no route'}`);
          }
        }
      }
      expect(unreached).toEqual([]);
      expect(routerDisagrees).toEqual([]);
    }
  );
});

describe('pack size budget', () => {
  it('grows the gzipped plan.json by at most 15 % over the recorded baseline', () => {
    // Baseline: main before routing. To move it deliberately, re-record
    // scripts/pack-size-baseline.json in the change that justifies the growth
    // (see docs/architecture/ship_map_pack_routing.md).
    const baseline = JSON.parse(readFileSync('scripts/pack-size-baseline.json', 'utf8'))[
      'celebrity-xcel'
    ];
    const gzipBytes = gzipSync(`${JSON.stringify(pack)}\n`).length;
    expect(gzipBytes).toBeLessThanOrEqual(Math.floor(baseline.gzipBytes * 1.15));
  });
});
