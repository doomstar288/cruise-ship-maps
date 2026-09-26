/**
 * Shortest routes over a Ship Map Pack's `routing` block (roadmap P2.4).
 *
 * Dependency-free and pure, so the maps site, the exporter's tests and the
 * route-fixture recorder all run the same code. AuraTrip keeps a TypeScript
 * port; `v1/ships/<id>/route-fixtures.json` is the contract between the two.
 * The block's schema is in docs/architecture/ship_map_pack_routing.md.
 */

/**
 * Time costs, in seconds. Walking uses `routing.walkingSpeedMps`. Lift times
 * are guesses (a wait to board plus a ride per level); stairs are one flight
 * per level. They only decide which route wins and roughly how long it takes.
 */
export const ROUTE_COSTS = Object.freeze({
  elevatorBoardS: 60,
  elevatorPerLevelS: 8,
  stairsPerLevelS: 30,
});

const EPS = 1e-9;

/**
 * Expand the compact block into plain nodes and undirected edges.
 * Accepts a whole pack or just its `routing` block: `routing.decks` is in
 * `pack.decks` order, so levels (Deck 12 → 14 is one) come from it alone.
 */
export function expandRouting(packOrRouting) {
  const routing = packOrRouting.routing ?? packOrRouting;
  const level = new Map(routing.decks.map((d, i) => [d.deckNumber, i]));
  const nodes = [];
  const edges = [];
  const byFeature = new Map();
  for (const { deckNumber, nodes: tuples, walk } of routing.decks) {
    tuples.forEach(([x, y, kind = 'corridor', featureId, entrance], index) => {
      const node = { key: `${deckNumber}:${index}`, deck: deckNumber, at: [x, y], kind };
      if (featureId !== undefined) node.featureId = featureId;
      if (kind === 'entrance') {
        if (entrance === 'projected') node.projected = true;
        else node.entrance = entrance;
      }
      if (kind !== 'entrance' && featureId) byFeature.set(featureId, node);
      nodes.push(node);
    });
    for (const [i, j, lengthM, through] of walk) {
      const edge = { from: `${deckNumber}:${i}`, to: `${deckNumber}:${j}`, kind: 'walk', lengthM };
      if (through) edge.through = through;
      edges.push(edge);
    }
  }
  const levels = (a, b) => Math.abs(level.get(a.deck) - level.get(b.deck));
  for (const { bank, stops } of routing.elevators) {
    const at = stops.map((id) => byFeature.get(id));
    at.forEach((a, i) => {
      for (const b of at.slice(i + 1))
        edges.push({ from: a.key, to: b.key, kind: 'elevator', bank, decks: levels(a, b) });
    });
  }
  for (const stops of routing.stairs) {
    const at = stops.map((id) => byFeature.get(id));
    for (let i = 1; i < at.length; i += 1) {
      edges.push({
        from: at[i - 1].key,
        to: at[i].key,
        kind: 'stairs',
        decks: levels(at[i - 1], at[i]),
        stepFree: false,
      });
    }
  }
  return { nodes, edges };
}

/** Binary min-heap of [cost, index]; ties go to the lower node index so routes are deterministic. */
class Heap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  static less(a, b) {
    return a[0] < b[0] - EPS || (Math.abs(a[0] - b[0]) <= EPS && a[1] < b[1]);
  }
  push(item) {
    const { items } = this;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!Heap.less(items[i], items[parent])) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }
  pop() {
    const { items } = this;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && Heap.less(items[l], items[m])) m = l;
        if (r < items.length && Heap.less(items[r], items[m])) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return top;
  }
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * A router over one pack's `routing` block.
 *
 * Endpoints:
 * - `{ featureId }`: a venue's doors on the graph (any one), or an elevator
 *   or stairwell's landing.
 * - `{ deck, at: [x, y] }`: a point such as a cabin centre, snapped to the
 *   nearest `corridor` node on that deck. The snap distance is added as walking.
 *   `cabinId` may ride along for the caller's benefit; it is ignored.
 * - `{ deck, elevators: true }`: any elevator lobby on that deck.
 */
export function createRouter(routing, costs = ROUTE_COSTS) {
  const { nodes, edges } = expandRouting(routing);
  const speed = routing.walkingSpeedMps;
  const index = new Map(nodes.map((n, i) => [n.key, i]));
  const adjacency = nodes.map(() => []);
  for (const edge of edges) {
    const a = index.get(edge.from);
    const b = index.get(edge.to);
    adjacency[a].push({ to: b, edge });
    adjacency[b].push({ to: a, edge });
  }

  const featureNodes = new Map();
  nodes.forEach((node, i) => {
    if (!node.featureId) return;
    if (!featureNodes.has(node.featureId)) featureNodes.set(node.featureId, []);
    featureNodes.get(node.featureId).push(i);
  });

  const edgeCost = (edge) => {
    if (edge.kind === 'walk') return edge.lengthM / speed;
    if (edge.kind === 'elevator')
      return costs.elevatorBoardS + costs.elevatorPerLevelS * edge.decks;
    return costs.stairsPerLevelS * edge.decks;
  };

  /** [{ node, snapM }] for an endpoint, or throws when it isn't on the graph. */
  function resolve(endpoint) {
    if (endpoint.featureId !== undefined) {
      const found = featureNodes.get(endpoint.featureId);
      if (!found) throw new Error(`${endpoint.featureId} is not on the routing graph`);
      return found.map((node) => ({ node, snapM: 0 }));
    }
    if (endpoint.elevators) {
      const lobbies = nodes.flatMap((n, i) =>
        n.deck === endpoint.deck && n.kind === 'elevator_lobby' && adjacency[i].length > 0
          ? [i]
          : []
      );
      if (lobbies.length === 0)
        throw new Error(`Deck ${endpoint.deck} has no elevator lobby on the graph`);
      return lobbies.map((node) => ({ node, snapM: 0 }));
    }
    if (endpoint.at) {
      let best = null;
      nodes.forEach((n, i) => {
        if (n.deck !== endpoint.deck || n.kind !== 'corridor') return;
        const d = distance(n.at, endpoint.at);
        if (!best || d < best.snapM - EPS) best = { node: i, snapM: d };
      });
      if (!best) throw new Error(`Deck ${endpoint.deck} has no corridor node to snap to`);
      return [best];
    }
    throw new Error('A route endpoint needs featureId, elevators or at');
  }

  /**
   * Cheapest route between two endpoints, or null when none exists.
   * `stepFree: true` leaves out stairs. `avoidLifts: true` leaves out lifts, for
   * a muster route (stairs only). With both, only walking is left, so a trip to
   * another deck or walk section is null: never fall back to either.
   */
  function route(from, to, { stepFree = false, avoidLifts = false } = {}) {
    const sources = resolve(from);
    const targets = resolve(to);
    const cost = new Float64Array(nodes.length).fill(Infinity);
    const via = new Array(nodes.length).fill(null);
    const heap = new Heap();
    for (const { node, snapM } of sources) {
      const c = snapM / speed;
      if (c < cost[node]) {
        cost[node] = c;
        heap.push([c, node]);
      }
    }
    while (heap.size > 0) {
      const [c, node] = heap.pop();
      if (c > cost[node] + EPS) continue;
      for (const { to: next, edge } of adjacency[node]) {
        if (stepFree && edge.kind === 'stairs') continue;
        if (avoidLifts && edge.kind === 'elevator') continue;
        const nc = c + edgeCost(edge);
        if (nc < cost[next] - EPS || (Math.abs(nc - cost[next]) <= EPS && node < via[next]?.node)) {
          cost[next] = nc;
          via[next] = { node, edge };
          heap.push([nc, next]);
        }
      }
    }

    let end = null;
    for (const t of targets) {
      const total = cost[t.node] + t.snapM / speed;
      if (total === Infinity) continue;
      if (
        !end ||
        total < end.total - EPS ||
        (Math.abs(total - end.total) <= EPS && t.node < end.node)
      ) {
        end = { ...t, total };
      }
    }
    if (!end) return null;

    const path = [end.node];
    while (via[path[0]]) path.unshift(via[path[0]].node);
    const start = sources.find((s) => s.node === path[0]);
    return describe(path, via, start, end, from, to);
  }

  function describe(path, via, start, end, from, to) {
    const legs = [];
    let walkM = start.snapM + end.snapM;
    const walkLeg = (deck) => {
      const last = legs[legs.length - 1];
      if (last?.kind === 'walk' && last.deck === deck) return last;
      const leg = { kind: 'walk', deck, points: [], lengthM: 0, through: [] };
      legs.push(leg);
      return leg;
    };

    const first = nodes[path[0]];
    if (start.snapM > 0) {
      const leg = walkLeg(first.deck);
      leg.points.push(from.at);
      leg.lengthM += start.snapM;
    }
    path.forEach((i, step) => {
      const node = nodes[i];
      const edge = step === 0 ? null : via[i].edge;
      if (!edge || edge.kind === 'walk') {
        const leg = walkLeg(node.deck);
        if (edge) {
          leg.lengthM += edge.lengthM;
          walkM += edge.lengthM;
          if (edge.through) leg.through.push(edge.through);
        }
        leg.points.push(node.at);
        return;
      }
      const prev = nodes[path[step - 1]];
      // A landing with no walk yet (riding straight on) isn't a walk.
      if (legs.at(-1)?.kind === 'walk' && legs.at(-1).points.length === 1) legs.pop();
      const last = legs[legs.length - 1];
      if (edge.kind === 'stairs' && last?.kind === 'stairs') {
        last.toDeck = node.deck;
        last.to = node.featureId;
        last.levels += edge.decks;
        last.toAt = node.at;
        walkLeg(node.deck).points.push(node.at);
        return;
      }
      legs.push({
        kind: edge.kind,
        ...(edge.bank ? { bank: edge.bank } : {}),
        fromDeck: prev.deck,
        toDeck: node.deck,
        from: prev.featureId,
        to: node.featureId,
        levels: edge.decks,
        fromAt: prev.at,
        toAt: node.at,
      });
      // The next walk starts at this landing.
      walkLeg(node.deck).points.push(node.at);
    });
    if (end.snapM > 0) {
      const leg = walkLeg(nodes[end.node].deck);
      leg.points.push(to.at);
      leg.lengthM += end.snapM;
    }

    const kept = legs.filter((leg) => leg.kind !== 'walk' || leg.points.length > 1);
    for (const leg of kept) {
      if (leg.kind !== 'walk') continue;
      leg.lengthM = Math.round(leg.lengthM * 100) / 100;
      leg.points = leg.points.filter(
        (p, i, all) => i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]
      );
      leg.through = [...new Set(leg.through)];
    }
    const origin = nodes[path[0]];
    const destination = nodes[end.node];
    return {
      origin: {
        deck: origin.deck,
        node: origin.key,
        featureId: origin.featureId,
        snapM: round2(start.snapM),
      },
      destination: {
        deck: destination.deck,
        node: destination.key,
        featureId: destination.featureId,
        snapM: round2(end.snapM),
      },
      walkM: round2(walkM),
      timeS: Math.round(end.total * 10) / 10,
      legs: kept,
      deckChanges: kept
        .filter((leg) => leg.kind !== 'walk')
        .map(({ kind, fromDeck, toDeck }) => ({ mode: kind, fromDeck, toDeck })),
    };
  }

  return { route, hasFeature: (id) => featureNodes.has(id), nodes, edges };
}

const round2 = (n) => Math.round(n * 100) / 100;
