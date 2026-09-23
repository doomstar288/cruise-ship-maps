/**
 * Routing graph for Ship Map Pack v1 (roadmap P2.1).
 *
 * A small walk/elevator/stairs graph, so consumers can give walking directions,
 * walk times and "leave by" times offline. Like `entrances`, it is DERIVED from
 * the exported features and never traced from an official plan.
 *
 * Walkways are not features on public decks: they are the gaps the generator
 * leaves between rectangles, plus elevator lobbies, stairwells and the atrium
 * (see venue-entrances.mjs). So each deck is rasterised: a point is walkable
 * when it is inside the hull and at least WALK_CLEARANCE_M from the hull and
 * from every feature that is not circulation. That rules out the drawing seams
 * between neighbours. The walkable raster is thinned
 * to its centreline, the centreline becomes straight walk edges, and lobbies and
 * doors are joined onto it. Dead ends that serve no door, lobby or cabin are
 * pruned.
 *
 * The synthetic layout does not join every part of every deck: full-beam venues
 * and crew blocks cut Decks 2, 4, 5 and 14–16 into sections between elevator
 * cores. That is kept, not papered over. Every walk section must contain an
 * elevator lobby, and the ship is connected once lifts count. A few doors open
 * onto sections with no lobby at all; ROUTING_CONNECTORS links those, each with
 * its reason. The tests hold the list to exactly the links that are needed.
 *
 * Operates on exported pack decks only. See docs/architecture/ship_map_pack_routing.md.
 */

import { distanceToRing, insidePolygon, isCirculation } from './venue-entrances.mjs';

/** Default walking pace a consumer turns `lengthM` into time with. */
export const WALKING_SPEED_MPS = 1.1;
/** Raster pitch. Passages are 1.8–2 m, so this leaves 2+ samples across each centre band. */
const RASTER_M = 0.25;
/**
 * A point this far from every wall is walkable: the middle of a passage at
 * least 1.1 m wide. Drawing seams between neighbours are 1 m or less; the
 * staggered cabins in the bow pinch stateroom corridors to ~1.35 m. (Doors use
 * the stricter MIN_PASSAGE_M; a guest can walk a narrower corridor than a door
 * is placed on.)
 */
export const WALK_CLEARANCE_M = 0.55;
/** A door or lobby joins the walk graph along a line at least this far from walls. */
const ATTACH_CLEARANCE_M = 0.3;
/** How far a door or lobby may be from the centreline it joins. */
const MAX_ATTACH_M = 12;
/** How far a venue without entrances may be from the walk graph. */
const MAX_PROJECT_M = 16;
/** Centreline tolerance when straightening the thinned raster into edges. */
const SIMPLIFY_M = 0.3;
/**
 * String-pulling may cut a corner by at most this much. More, and in an open
 * lobby it would drag the spine to one side, away from the doors on the other.
 */
const PULL_DEVIATION_M = 4;
/** Thinning leaves whiskers at corners; dead ends shorter than this are noise. */
const WHISKER_M = 2;
/** A lobby or door this close to a centreline node takes that node's place. */
const MERGE_TARGET_M = 0.5;
/** Joining a door this close to an existing node reuses the node. */
const REUSE_NODE_M = 1.5;
/**
 * Every cabin keeps a walk edge within this distance of its centre while dead
 * ends are pruned. Outside cabins are ~4.5 m from their corridor; the stern
 * transom cabins are the furthest.
 */
export const CABIN_COVER_M = 12;
/** Walk edges near cabins carry a `corridor` node at least this often (see snap rule). */
export const MAX_CORRIDOR_NODE_SPACING_M = 16;

const EPS = 1e-9;
const round = (n) => Math.round(n * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Links the synthetic layout needs but does not draw. Each one joins a walk
 * section that has doors but no elevator lobby to the rest of its deck. `path`
 * is a polyline in pack coordinates; both ends join the walk graph, unless
 * `featureId` is set, in which case the last point becomes a projected entrance
 * of that feature. `through` names the one feature the link may cross.
 *
 * These are modelling decisions, not geometry: changing the layout should make
 * them unnecessary, and the tests then fail until the entry is removed.
 */
export const ROUTING_CONNECTORS = [
  {
    deck: 4,
    // Cosmopolitan and Cyprus sit side by side with a 0.4 m drawing seam
    // between them; Mosaic's doors open onto the 2 m passage behind them, which
    // the hull closes at both ends. A real ship has a walkway between two main
    // dining rooms, so the seam stands in for it.
    path: [
      [268, 19.5],
      [297, 19.5],
    ],
    reason: 'Mosaic: walkway between Cosmopolitan and Cyprus (drawn as a 0.4 m seam)',
  },
  {
    deck: 5,
    // Market and Spice Café are both inside The Bazaar, one open food hall. The
    // Market is full-beam, so Spice Café's passage is reached through it.
    path: [
      [268, 19.5],
      [305, 19.5],
    ],
    through: 'v5-bazaar-market',
    reason: 'Spice Café: through the Market, the same open Bazaar hall',
  },
  {
    deck: 17,
    // The Retreat Bar is the sundeck's poolside bar; the sundeck is full-beam.
    path: [
      [88, 19.5],
      [151, 19.5],
    ],
    through: 'v17-retreat-sundeck',
    reason: 'The Retreat Bar: across the Retreat Sundeck it serves',
  },
  {
    deck: 14,
    // The Aft Sun Deck's only walkway is the passage behind Il Secondo Bacio,
    // which the hull closes to port and the Café Terrace's 0.4 m seam closes to
    // starboard. Both are open deck; the seam stands in for the walkway along
    // the terrace's edge.
    path: [
      [268, 19.5],
      [293, 19.5],
    ],
    reason: 'Aft Sun Deck: along the edge of the Oceanview Café Terrace (drawn as a 0.4 m seam)',
  },
  // The Magic Carpet docks outboard of the hull, behind the venue it extends.
  {
    deck: 2,
    path: [
      [185, 29],
      [169, 29],
      [169, 38.8],
    ],
    through: 'v2-destination-gateway',
    featureId: 'v2-magic-carpet',
    reason: 'Magic Carpet tender platform: boarded from Destination Gateway',
  },
  {
    deck: 5,
    path: [
      [168, 26.5],
      [177, 26.5],
      [177, 38.8],
    ],
    through: 'v5-world-class-bar',
    featureId: 'v5-magic-carpet',
    reason: 'Magic Carpet dining stop: reached through World Class Bar',
  },
  {
    deck: 14,
    path: [
      [185, 34],
      [169, 34],
      [169, 38.8],
    ],
    through: 'v14-cabanas',
    featureId: 'v14-magic-carpet',
    reason: 'Magic Carpet pool-deck stop: in front of the cabanas',
  },
  {
    deck: 16,
    path: [
      [185, 32],
      [169, 32],
      [169, 37.63],
    ],
    through: 'v16-hot-tubs',
    featureId: 'v16-magic-carpet',
    reason: 'Magic Carpet top stop: beside the glass-walled hot tubs',
  },
];

/**
 * Resolves routing connectors appropriate for a given ship / hull configuration.
 * For Celebrity Xcel, returns ROUTING_CONNECTORS unchanged to guarantee 100% parity.
 * Solstice Class (decks 2-12, 14-16) and Millennium Class (decks 2-12) are fully
 * self-connected via natural corridors and circulation and do not use Edge connectors.
 */
export function getShipRoutingConnectors(optionsOrShipId, maybeDeckRange) {
  let shipId, lengthMeters = 327, decks = [], deckRange;
  if (typeof optionsOrShipId === 'object' && optionsOrShipId !== null) {
    ({ shipId, lengthMeters = 327, decks = [], deckRange } = optionsOrShipId);
  } else {
    shipId = optionsOrShipId;
    deckRange = maybeDeckRange;
  }

  if (!shipId || shipId === 'celebrity-xcel') {
    return ROUTING_CONNECTORS;
  }

  const SOLSTICE_SHIPS = new Set([
    'celebrity-solstice',
    'celebrity-equinox',
    'celebrity-eclipse',
    'celebrity-silhouette',
    'celebrity-reflection',
  ]);

  const MILLENNIUM_SHIPS = new Set([
    'celebrity-millennium',
    'celebrity-infinity',
    'celebrity-summit',
    'celebrity-constellation',
  ]);

  const isSolstice =
    SOLSTICE_SHIPS.has(shipId) ||
    (deckRange && deckRange.max === 16 && deckRange.min === 2 && decks.length === 14);
  const isMillennium =
    MILLENNIUM_SHIPS.has(shipId) ||
    (deckRange && deckRange.max === 12 && deckRange.min === 2);

  if (isSolstice || isMillennium) {
    return [];
  }

  const packDecks = decks;
  return ROUTING_CONNECTORS.filter((c) => {
    // If connector specifically requires Market at The Bazaar and deck doesn't have it
    if (c.through === 'v5-bazaar-market') {
      const d5 = packDecks.find((d) => d.deckNumber === 5);
      if (!d5 || !d5.features.some((f) => f.id === 'v5-bazaar-market')) {
        return false;
      }
    }
    // If connector deck does not exist in pack
    if (packDecks.length && !packDecks.some((d) => d.deckNumber === c.deck)) {
      return false;
    }
    return true;
  }).map((c) => {
    if (lengthMeters < 320) {
      if (c.deck === 4 && c.path[1][0] === 297) {
        return { ...c, path: [[268, 19.5], [289, 19.5]] };
      }
      if (c.deck === 14 && c.path[1][0] === 293) {
        return { ...c, path: [[268, 19.5], [285, 19.5]] };
      }
      if (c.deck === 16 && c.featureId === 'v16-magic-carpet') {
        const { through: _through, ...rest } = c;
        return rest;
      }
    }
    return c;
  });
}

// ------------------------------------------------------------------ geometry

const rectOf = ({ bounds: [[x1, y1], [x2, y2]] }) => ({
  x1: Math.min(x1, x2),
  y1: Math.min(y1, y2),
  x2: Math.max(x1, x2),
  y2: Math.max(y1, y2),
});

/** Distance from a point to a rectangle (0 inside). */
const distanceToRect = ([x, y], r) =>
  Math.hypot(Math.max(r.x1 - x, 0, x - r.x2), Math.max(r.y1 - y, 0, y - r.y2));

/** Whether segment a→b enters the interior of `r` shrunk by `eps` (Liang–Barsky). */
export function segmentEntersRect(a, b, r, eps = 0.01) {
  const x1 = r.x1 + eps;
  const y1 = r.y1 + eps;
  const x2 = r.x2 - eps;
  const y2 = r.y2 - eps;
  if (x2 <= x1 || y2 <= y1) return false;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < EPS) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, a[0] - x1) &&
    clip(dx, x2 - a[0]) &&
    clip(-dy, a[1] - y1) &&
    clip(dy, y2 - a[1]) &&
    t1 - t0 > EPS
  );
}

/** Whether segments a→b and c→d properly cross. */
function segmentsCross(a, b, c, d) {
  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

// ---------------------------------------------------------------- deck model

/** Obstacles and hull of one deck, with the checks every step shares. */
function deckModel(deck) {
  const outline = deck.outline;
  const obstacles = deck.features
    .filter((f) => Array.isArray(f.bounds) && !isCirculation(f))
    .map((f) => ({ id: f.id, rect: rectOf(f) }));

  const insideHull = (p) => insidePolygon(p, outline);

  /** Clearance from the hull and every obstacle except `ignore`. */
  const clearance = (p, ignore) => {
    let best = distanceToRing(p, outline);
    for (const o of obstacles) {
      if (o.id === ignore) continue;
      const d = distanceToRect(p, o.rect);
      if (d < best) best = d;
    }
    return best;
  };

  /** Segment stays on deck and out of every obstacle interior (but `through`). */
  const segmentFree = (a, b, through) => {
    if (!insideHull(a) || !insideHull(b)) return false;
    for (let i = 1; i < outline.length; i += 1) {
      if (segmentsCross(a, b, outline[i - 1], outline[i])) return false;
    }
    return !obstacles.some((o) => o.id !== through && segmentEntersRect(a, b, o.rect));
  };

  /**
   * A join line from a door or lobby at `a` to the centreline at `b`: free,
   * and clear of walls once it leaves the door, so it can't thread a seam.
   */
  const joinFree = (a, b) => {
    if (!segmentFree(a, b)) return false;
    const length = dist(a, b);
    for (let s = Math.min(length, WALK_CLEARANCE_M); s <= length; s += RASTER_M) {
      const t = length ? s / length : 0;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (clearance(p) < ATTACH_CLEARANCE_M) return false;
    }
    return true;
  };

  return { deck, outline, obstacles, insideHull, clearance, segmentFree, joinFree };
}

// ------------------------------------------------------------------ raster

/** Walkable raster: 1 where a point is inside the hull and WALK_CLEARANCE_M from walls. */
function walkableRaster(model) {
  const { outline, obstacles } = model;
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const width = Math.ceil((Math.max(...xs) - x0) / RASTER_M) + 1;
  const height = Math.ceil((Math.max(...ys) - y0) / RASTER_M) + 1;
  const grid = new Uint8Array(width * height);
  const at = (i, j) => [x0 + i * RASTER_M, y0 + j * RASTER_M];

  // Inside the hull, column by column (even-odd crossings of the outline).
  for (let i = 0; i < width; i += 1) {
    const x = x0 + i * RASTER_M;
    const crossings = [];
    for (let k = 1; k < outline.length; k += 1) {
      const [ax, ay] = outline[k - 1];
      const [bx, by] = outline[k];
      if (ax > x !== bx > x) crossings.push(ay + ((x - ax) * (by - ay)) / (bx - ax));
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const jFrom = Math.ceil((crossings[k] - y0) / RASTER_M);
      const jTo = Math.floor((crossings[k + 1] - y0) / RASTER_M);
      for (let j = Math.max(0, jFrom); j <= Math.min(height - 1, jTo); j += 1)
        grid[i * height + j] = 1;
    }
  }

  // Knock out everything within WALK_CLEARANCE_M of a wall.
  const stamp = (minX, minY, maxX, maxY, distanceTo) => {
    const iFrom = Math.max(0, Math.floor((minX - WALK_CLEARANCE_M - x0) / RASTER_M));
    const iTo = Math.min(width - 1, Math.ceil((maxX + WALK_CLEARANCE_M - x0) / RASTER_M));
    const jFrom = Math.max(0, Math.floor((minY - WALK_CLEARANCE_M - y0) / RASTER_M));
    const jTo = Math.min(height - 1, Math.ceil((maxY + WALK_CLEARANCE_M - y0) / RASTER_M));
    for (let i = iFrom; i <= iTo; i += 1) {
      for (let j = jFrom; j <= jTo; j += 1) {
        const k = i * height + j;
        if (grid[k] && distanceTo(at(i, j)) < WALK_CLEARANCE_M) grid[k] = 0;
      }
    }
  };
  for (let k = 1; k < outline.length; k += 1) {
    const a = outline[k - 1];
    const b = outline[k];
    stamp(
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[0], b[0]),
      Math.max(a[1], b[1]),
      (p) => distanceToRing(p, [a, b])
    );
  }
  for (const { rect } of obstacles) {
    stamp(rect.x1, rect.y1, rect.x2, rect.y2, (p) => distanceToRect(p, rect));
  }
  return { grid, width, height, at, x0, y0 };
}

const NEIGHBOURS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/** Zhang–Suen thinning, then removal of staircase corners, in place. */
function thin({ grid, width, height }) {
  const get = (i, j) => (i >= 0 && j >= 0 && i < width && j < height ? grid[i * height + j] : 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const pass of [0, 1]) {
      const remove = [];
      for (let i = 0; i < width; i += 1) {
        for (let j = 0; j < height; j += 1) {
          if (!grid[i * height + j]) continue;
          const p = NEIGHBOURS.map(([di, dj]) => get(i + di, j + dj)); // P2..P9, clockwise from north
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k += 1) if (!p[k] && p[(k + 1) % 8]) a += 1;
          if (a !== 1) continue;
          const [n, , e, , s, , w] = p;
          if (pass === 0 ? n * e * s || e * s * w : n * e * w || n * s * w) continue;
          remove.push(i * height + j);
        }
      }
      for (const k of remove) grid[k] = 0;
      if (remove.length) changed = true;
    }
  }

  // A pixel whose neighbours already touch each other is a redundant corner.
  changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < width; i += 1) {
      for (let j = 0; j < height; j += 1) {
        if (!grid[i * height + j]) continue;
        const around = NEIGHBOURS.filter(([di, dj]) => get(i + di, j + dj));
        if (around.length < 2 || around.length > 3) continue;
        const touching = (u, v) => Math.max(Math.abs(u[0] - v[0]), Math.abs(u[1] - v[1])) <= 1;
        const seen = new Set([0]);
        const queue = [0];
        while (queue.length) {
          const u = queue.pop();
          around.forEach((v, idx) => {
            if (!seen.has(idx) && touching(around[u], v)) {
              seen.add(idx);
              queue.push(idx);
            }
          });
        }
        if (seen.size === around.length) {
          grid[i * height + j] = 0;
          changed = true;
        }
      }
    }
  }
}

// ------------------------------------------------------------------- graph

/** Mutable per-deck graph: nodes {x, y, kind, ...} and undirected edges. */
function createGraph(model) {
  const nodes = [];
  const edges = [];
  const addNode = (point, fields = {}) => {
    nodes.push({ at: point, kind: 'corridor', ...fields, alive: true });
    return nodes.length - 1;
  };
  const addEdge = (a, b, through, connector = false) => {
    if (a === b) return;
    edges.push({ a, b, through, connector, alive: true });
  };
  const liveEdges = () => edges.filter((e) => e.alive);
  const degree = () => {
    const deg = new Map();
    for (const e of liveEdges()) {
      deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
      deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
    }
    return deg;
  };
  return { model, nodes, edges, addNode, addEdge, liveEdges, degree };
}

/** Douglas–Peucker, splitting further wherever a shortcut would leave the walkway. */
function simplify(points, segmentFree) {
  if (points.length <= 2) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  let worst = -1;
  let worstD = 0;
  for (let k = 1; k < points.length - 1; k += 1) {
    const p = points[k];
    const len = dist(a, b);
    const d = len
      ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len
      : dist(a, p);
    if (d > worstD) {
      worstD = d;
      worst = k;
    }
  }
  if (worstD <= SIMPLIFY_M && segmentFree(a, b)) return [a, b];
  const split = worst > 0 ? worst : Math.floor(points.length / 2);
  return [
    ...simplify(points.slice(0, split + 1), segmentFree).slice(0, -1),
    ...simplify(points.slice(split), segmentFree),
  ];
}

/** Turns the thinned raster into graph nodes and straight walk edges. */
function traceSkeleton(graph, raster) {
  const { grid, width, height, at } = raster;
  const on = (i, j) => i >= 0 && j >= 0 && i < width && j < height && grid[i * height + j] === 1;
  const around = (k) => {
    const i = Math.floor(k / height);
    const j = k % height;
    return NEIGHBOURS.filter(([di, dj]) => on(i + di, j + dj)).map(
      ([di, dj]) => (i + di) * height + j + dj
    );
  };
  const pointOf = (k) => at(Math.floor(k / height), k % height);

  // Junctions and ends, clustered so a fat junction becomes one node.
  const clusterOf = new Map();
  const clusterNode = [];
  for (let k = 0; k < grid.length; k += 1) {
    if (!grid[k] || around(k).length === 2 || clusterOf.has(k)) continue;
    const members = [k];
    clusterOf.set(k, -1);
    for (let q = 0; q < members.length; q += 1) {
      for (const n of around(members[q])) {
        if (!clusterOf.has(n) && around(n).length !== 2) {
          clusterOf.set(n, -1);
          members.push(n);
        }
      }
    }
    const cx = members.reduce((s, m) => s + pointOf(m)[0], 0) / members.length;
    const cy = members.reduce((s, m) => s + pointOf(m)[1], 0) / members.length;
    const anchor = members.reduce((best, m) =>
      dist(pointOf(m), [cx, cy]) < dist(pointOf(best), [cx, cy]) ? m : best
    );
    const id = graph.addNode(pointOf(anchor));
    clusterNode.push(id);
    for (const m of members) clusterOf.set(m, id);
  }

  const visited = new Set();
  const walk = (start, first) => {
    const path = [start, first];
    let prev = start;
    let cur = first;
    while (!clusterOf.has(cur)) {
      visited.add(cur);
      const next = around(cur).find((n) => n !== prev);
      if (next === undefined) break;
      prev = cur;
      cur = next;
      path.push(cur);
    }
    return path;
  };
  const emit = (fromNode, pixels, toNode) => {
    const points = pixels.map(pointOf);
    points[0] = graph.nodes[fromNode].at;
    points[points.length - 1] = graph.nodes[toNode].at;
    const line = simplify(points, (a, b) => graph.model.segmentFree(a, b));
    let prev = fromNode;
    for (let k = 1; k < line.length - 1; k += 1) {
      const id = graph.addNode(line[k]);
      graph.addEdge(prev, id);
      prev = id;
    }
    graph.addEdge(prev, toNode);
  };

  for (const [k, node] of clusterOf) {
    for (const n of around(k)) {
      if (clusterOf.has(n)) {
        if (clusterOf.get(n) !== node && k < n) emit(node, [k, n], clusterOf.get(n));
        continue;
      }
      if (visited.has(n)) continue;
      const path = walk(k, n);
      const end = path[path.length - 1];
      if (clusterOf.has(end)) emit(node, path, clusterOf.get(end));
    }
  }
  // Closed loops with no junction on them.
  for (let k = 0; k < grid.length; k += 1) {
    if (!grid[k] || clusterOf.has(k) || visited.has(k)) continue;
    const id = graph.addNode(pointOf(k));
    clusterOf.set(k, id);
    const path = walk(k, around(k)[0]);
    emit(id, path, id);
  }
}

/** Nearest point on a segment to p, as { t, point }. */
function project(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return { t, point: [a[0] + t * dx, a[1] + t * dy] };
}

/** Splits an edge at a point on it and returns the new node. */
function splitEdge(graph, edge, point) {
  const id = graph.addNode(point);
  edge.alive = false;
  graph.addEdge(edge.a, id, edge.through, edge.connector);
  graph.addEdge(id, edge.b, edge.through, edge.connector);
  return id;
}

/**
 * Candidate places on the walk graph to join `point`, nearest first: an
 * existing node when one is close along the edge, else a point to split at.
 */
function joinCandidates(graph, point, maxDistance, allowed = () => true) {
  const out = [];
  for (const edge of graph.liveEdges()) {
    if (!allowed(edge)) continue;
    const a = graph.nodes[edge.a].at;
    const b = graph.nodes[edge.b].at;
    const { point: q } = project(point, a, b);
    const d = dist(point, q);
    if (d > maxDistance) continue;
    if (dist(q, a) <= REUSE_NODE_M) out.push({ d: dist(point, a), node: edge.a });
    else if (dist(q, b) <= REUSE_NODE_M) out.push({ d: dist(point, b), node: edge.b });
    out.push({ d, edge, q: [round(q[0]), round(q[1])] });
  }
  // Prefer reusing a node over splitting at the same spot.
  return out.sort((u, v) => u.d - v.d || (u.node === undefined) - (v.node === undefined));
}

/** Joins a point to the graph along a clear line; returns the graph node, or null. */
function joinPoint(graph, point, { maxDistance = MAX_ATTACH_M, check, allowed } = {}) {
  const free = check ?? ((a, b) => graph.model.joinFree(a, b));
  for (const c of joinCandidates(graph, point, maxDistance, allowed)) {
    if (c.node !== undefined) {
      if (graph.nodes[c.node].alive && free(point, graph.nodes[c.node].at)) return c.node;
    } else if (c.edge.alive && free(point, c.q)) {
      return splitEdge(graph, c.edge, c.q);
    }
  }
  return null;
}

/** Joins a target node (lobby, door) to the graph, or lands it on the centreline. */
function attachTarget(graph, point, fields, options) {
  const id = graph.addNode(point, fields);
  const hub = joinPoint(graph, point, options);
  if (hub === null) {
    graph.nodes[id].alive = false;
    return null;
  }
  if (graph.nodes[hub].kind === 'corridor' && dist(graph.nodes[hub].at, point) <= MERGE_TARGET_M) {
    // On (or all but on) the centreline: become that node, if its edges still clear.
    const neighbours = graph
      .liveEdges()
      .filter((e) => e.a === hub || e.b === hub)
      .map((e) => [graph.nodes[e.a === hub ? e.b : e.a].at, e.through]);
    if (neighbours.every(([at, through]) => graph.model.segmentFree(point, at, through))) {
      graph.nodes[id].alive = false;
      Object.assign(graph.nodes[hub], fields, { at: point });
      return hub;
    }
  }
  graph.addEdge(id, hub);
  return id;
}

/** Node ids reachable from `start` over live edges. */
function componentOf(graph, start) {
  const adjacency = new Map();
  for (const e of graph.liveEdges()) {
    if (!adjacency.has(e.a)) adjacency.set(e.a, []);
    if (!adjacency.has(e.b)) adjacency.set(e.b, []);
    adjacency.get(e.a).push(e.b);
    adjacency.get(e.b).push(e.a);
  }
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const n of adjacency.get(queue.pop()) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Drops every node and edge outside the walk sections that hold a lobby. */
function keepLobbySections(graph) {
  const keep = new Set();
  graph.nodes.forEach((n, id) => {
    if (n.alive && (n.kind === 'elevator_lobby' || n.kind === 'stair') && !keep.has(id)) {
      for (const m of componentOf(graph, id)) keep.add(m);
    }
  });
  graph.nodes.forEach((n, id) => {
    if (!keep.has(id)) n.alive = false;
  });
  for (const e of graph.edges) if (!keep.has(e.a) || !keep.has(e.b)) e.alive = false;
}

const segmentDistance = (p, a, b) => dist(p, project(p, a, b).point);

/**
 * Prunes dead ends that serve nothing: no door, lobby or stair at the tip, and
 * no cabin that would lose its last walk edge within CABIN_COVER_M. A dead end
 * a cabin still needs is shortened to the furthest point that cabin needs.
 */
function pruneDeadEnds(graph, cabins, whiskersOnly = false) {
  let changed = true;
  while (changed) {
    changed = false;
    const deg = graph.degree();
    for (const edge of graph.liveEdges()) {
      for (const [leaf, inner] of [
        [edge.a, edge.b],
        [edge.b, edge.a],
      ]) {
        const leafNode = graph.nodes[leaf];
        if (deg.get(leaf) !== 1 || leafNode.kind !== 'corridor' || !edge.alive) continue;
        const a = graph.nodes[inner].at;
        const b = leafNode.at;
        const length = dist(a, b);
        if (whiskersOnly) {
          if (length < WHISKER_M && deg.get(inner) >= 3) {
            edge.alive = false;
            leafNode.alive = false;
            changed = true;
          }
          continue;
        }
        const others = graph.liveEdges().filter((e) => e !== edge);
        const needT = cabins
          .filter((c) => segmentDistance(c, a, b) <= CABIN_COVER_M)
          .filter(
            (c) =>
              !others.some(
                (e) => segmentDistance(c, graph.nodes[e.a].at, graph.nodes[e.b].at) <= CABIN_COVER_M
              )
          )
          .map((c) => project(c, a, b).t);
        if (!needT.length) {
          edge.alive = false;
          leafNode.alive = false;
          changed = true;
        } else {
          const t = Math.max(...needT);
          if (t < 1 - 1e-6 && length * (1 - t) > 0.5) {
            leafNode.at = [round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t)];
            changed = true;
          }
        }
      }
    }
  }
}

/**
 * String-pulls runs of plain corridor nodes: the thinned raster bulges into
 * lobbies and corners, so each run is replaced by the fewest straight legs that
 * stay on walkable raster (within one cell), as a guest would actually walk.
 */
function straighten(graph, walkable) {
  const { grid, width, height, x0, y0 } = walkable;
  const onWalkway = ([x, y]) => {
    const i = Math.round((x - x0) / RASTER_M);
    const j = Math.round((y - y0) / RASTER_M);
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        const ii = i + di;
        const jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < width && jj < height && grid[ii * height + jj]) return true;
      }
    }
    return false;
  };
  const clear = (a, b) => {
    if (!graph.model.segmentFree(a, b)) return false;
    const length = dist(a, b);
    // Ends may be doors on a wall; only the stretch between must be walkway.
    for (let s = WALK_CLEARANCE_M; s <= length - WALK_CLEARANCE_M; s += RASTER_M) {
      const t = s / length;
      if (!onWalkway([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
    }
    return true;
  };

  const incident = new Map();
  for (const e of graph.liveEdges()) {
    for (const n of [e.a, e.b]) {
      if (!incident.has(n)) incident.set(n, []);
      incident.get(n).push(e);
    }
  }
  const inRun = (id) => graph.nodes[id].kind === 'corridor' && incident.get(id).length === 2;
  const done = new Set();
  for (const [anchor, list] of incident) {
    if (inRun(anchor)) continue;
    for (const first of list) {
      if (done.has(first)) continue;
      const run = [anchor];
      const runEdges = [first];
      let edge = first;
      let cur = first.a === anchor ? first.b : first.a;
      while (inRun(cur) && run.length < 10000) {
        run.push(cur);
        edge = incident.get(cur).find((e) => e !== edge);
        runEdges.push(edge);
        cur = edge.a === cur ? edge.b : edge.a;
      }
      run.push(cur);
      runEdges.forEach((e) => done.add(e));
      if (run.length < 3 || runEdges.some((e) => e.through || e.connector)) continue;

      const kept = [run[0]];
      let i = 0;
      const closed = run[0] === run[run.length - 1];
      while (i < run.length - 1) {
        // A loop back to its own anchor keeps at least one node on the far side.
        let j = closed && i === 0 ? run.length - 2 : run.length - 1;
        const shortcut = (j) => {
          const a = graph.nodes[run[i]].at;
          const b = graph.nodes[run[j]].at;
          const hugs = run
            .slice(i + 1, j)
            .every((id) => segmentDistance(graph.nodes[id].at, a, b) <= PULL_DEVIATION_M);
          return hugs && clear(a, b);
        };
        while (j > i + 1 && !shortcut(j)) j -= 1;
        if (closed && i === 0 && j === 0) j = 1;
        kept.push(run[j]);
        i = j;
      }
      if (kept.length === run.length) continue;
      runEdges.forEach((e) => {
        e.alive = false;
      });
      run.slice(1, -1).forEach((id) => {
        if (!kept.includes(id)) graph.nodes[id].alive = false;
      });
      for (let k = 1; k < kept.length; k += 1) graph.addEdge(kept[k - 1], kept[k]);
    }
  }
}

/** Removes plain corridor nodes that sit on a straight line between their neighbours. */
function mergeStraightRuns(graph) {
  let changed = true;
  while (changed) {
    changed = false;
    const incident = new Map();
    for (const e of graph.liveEdges()) {
      for (const n of [e.a, e.b]) {
        if (!incident.has(n)) incident.set(n, []);
        incident.get(n).push(e);
      }
    }
    for (const [id, list] of incident) {
      const node = graph.nodes[id];
      if (node.kind !== 'corridor' || list.length !== 2) continue;
      const [e1, e2] = list;
      if (!e1.alive || !e2.alive || e1.through !== e2.through || e1.connector !== e2.connector)
        continue;
      const u = e1.a === id ? e1.b : e1.a;
      const v = e2.a === id ? e2.b : e2.a;
      if (u === v) continue;
      const a = graph.nodes[u].at;
      const b = graph.nodes[v].at;
      if (segmentDistance(node.at, a, b) > 0.05) continue;
      if (!graph.model.segmentFree(a, b, e1.through)) continue;
      e1.alive = false;
      e2.alive = false;
      node.alive = false;
      graph.addEdge(u, v, e1.through, e1.connector);
      changed = true;
    }
  }
}

/** Adds corridor nodes along walk edges near cabins, so a cabin can snap to one. */
function densify(graph, cabins) {
  for (const edge of graph.liveEdges()) {
    const a = graph.nodes[edge.a].at;
    const b = graph.nodes[edge.b].at;
    const length = dist(a, b);
    if (length <= MAX_CORRIDOR_NODE_SPACING_M) continue;
    if (!cabins.some((c) => segmentDistance(c, a, b) <= CABIN_COVER_M)) continue;
    const pieces = Math.ceil(length / MAX_CORRIDOR_NODE_SPACING_M);
    edge.alive = false;
    let prev = edge.a;
    for (let k = 1; k < pieces; k += 1) {
      const t = k / pieces;
      const id = graph.addNode([round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t)]);
      graph.addEdge(prev, id, edge.through, edge.connector);
      prev = id;
    }
    graph.addEdge(prev, edge.b, edge.through, edge.connector);
  }
}

/** Guest destinations: what search lists, so what a route must reach. */
export const isRoutableTarget = (f) =>
  (f.featureType === 'venue' || f.featureType === 'poi' || f.featureType === 'muster_station') &&
  Array.isArray(f.bounds);

/**
 * A door for a venue without authored entrances. Candidates are points round
 * its boundary, clear of every other wall; the one with the shortest clear
 * line onto the walk graph wins, and among near-equals the one nearest the
 * middle of its face.
 */
function projectedEntrance(graph, feature) {
  const { model } = graph;
  const rect = rectOf(feature);
  const self = feature.id;
  const check = (from, to) =>
    model.segmentFree(from, to, self) && model.clearance(to, self) >= ATTACH_CLEARANCE_M;
  const notConnector = (e) => !e.connector; // a stand-in link is not a place for a door

  const faces = [
    [
      [rect.x1, rect.y1],
      [rect.x1, rect.y2],
    ],
    [
      [rect.x2, rect.y1],
      [rect.x2, rect.y2],
    ],
    [
      [rect.x1, rect.y1],
      [rect.x2, rect.y1],
    ],
    [
      [rect.x1, rect.y2],
      [rect.x2, rect.y2],
    ],
  ];
  let best = null;
  for (const [a, b] of faces) {
    const length = dist(a, b);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const steps = Math.max(1, Math.round(length / 0.5));
    for (let k = 0; k <= steps; k += 1) {
      const p = [
        round(a[0] + ((b[0] - a[0]) * k) / steps),
        round(a[1] + ((b[1] - a[1]) * k) / steps),
      ];
      if (!model.insideHull(p) || model.clearance(p, self) < WALK_CLEARANCE_M) continue;
      const join = joinCandidates(graph, p, MAX_PROJECT_M, notConnector)
        .slice(0, 6)
        .find((c) => check(p, c.node !== undefined ? graph.nodes[c.node].at : c.q));
      if (!join) continue;
      const score = [Math.round(join.d), dist(p, mid), p[0], p[1]];
      if (!best || compareTuples(score, best.score) < 0) best = { p, score };
    }
  }
  if (!best) return null;
  return attachTarget(
    graph,
    best.p,
    { kind: 'entrance', featureId: self, projected: true },
    { maxDistance: MAX_PROJECT_M, check, allowed: notConnector }
  );
}

/** Walk graph for one deck: node and edge lists in pack coordinates. */
function buildDeckGraph(deck, problem, connectors) {
  const model = deckModel(deck);
  const graph = createGraph(model);
  const cabins = deck.features.filter((f) => f.featureType === 'cabin').map((f) => f.center);

  const raster = walkableRaster(model);
  const walkable = { ...raster, grid: raster.grid.slice() };
  thin(raster);
  traceSkeleton(graph, raster);
  pruneDeadEnds(graph, cabins, true);
  straighten(graph, walkable);
  mergeStraightRuns(graph);

  // Lobbies and stair landings.
  for (const f of deck.features) {
    if (f.featureType !== 'elevator' && f.featureType !== 'stairwell') continue;
    const fields =
      f.featureType === 'elevator'
        ? { kind: 'elevator_lobby', featureId: f.id }
        : { kind: 'stair', featureId: f.id };
    const inside = (a, b) => model.segmentFree(a, b);
    if (attachTarget(graph, f.center, fields, { check: inside }) === null) {
      throw new Error(`Deck ${deck.deckNumber}: ${f.id} does not join any walkway`);
    }
  }

  // Hand-authored links (see ROUTING_CONNECTORS).
  for (const { path, through, featureId } of connectors.filter((c) => c.deck === deck.deckNumber)) {
    const inPath = (a, b) => model.segmentFree(a, b, through);
    const own = new Set();
    const link = (a, b) => {
      graph.addEdge(a, b, through, true);
      own.add(graph.edges[graph.edges.length - 1]);
    };
    /** A connector end on the walk graph: the node there, or a new one joined to it. */
    const onGraph = (point) => {
      const hub = joinPoint(graph, point, { check: inPath, allowed: (e) => !own.has(e) });
      if (hub === null) {
        problem(`Connector on Deck ${deck.deckNumber} ends off the walkways at ${point}`);
        return graph.addNode(point);
      }
      if (dist(graph.nodes[hub].at, point) < 0.01) return hub;
      const id = graph.addNode(point);
      link(hub, id);
      return id;
    };
    let prev = onGraph(path[0]);
    path.slice(1).forEach((point, k) => {
      if (!inPath(graph.nodes[prev].at, point)) {
        throw new Error(`Connector on Deck ${deck.deckNumber} crosses a wall at ${point}`);
      }
      const isEnd = k === path.length - 2;
      let id;
      if (isEnd && featureId)
        id = graph.addNode(point, { kind: 'entrance', featureId, projected: true });
      else if (isEnd) id = onGraph(point);
      else id = graph.addNode(point);
      link(prev, id);
      prev = id;
    });
  }

  keepLobbySections(graph);

  // Authored doors. One that opens onto a walk section with no lobby is left out.
  for (const f of deck.features) {
    (f.entrances ?? []).forEach((point, index) => {
      attachTarget(graph, point, { kind: 'entrance', featureId: f.id, entrance: index });
    });
  }

  // Every other destination gets a projected door.
  const served = new Set(
    graph.nodes.filter((n) => n.alive && n.kind === 'entrance').map((n) => n.featureId)
  );
  for (const f of deck.features) {
    if (!isRoutableTarget(f) || served.has(f.id)) continue;
    if (projectedEntrance(graph, f) === null) {
      problem(`Deck ${deck.deckNumber}: ${f.id} has no reachable door`);
    }
  }

  pruneDeadEnds(graph, cabins);
  straighten(graph, walkable);
  mergeStraightRuns(graph);

  densify(graph, cabins);
  return graph;
}

// ------------------------------------------------------------------ output

/** Node order within a deck: lobbies, stairs, doors, then corridor, each by position. */
const KIND_ORDER = ['elevator_lobby', 'stair', 'entrance', 'corridor'];

/** One node as a compact tuple (see the routing doc). */
function nodeTuple(node) {
  const [x, y] = [round(node.at[0]), round(node.at[1])];
  if (node.kind === 'corridor') return [x, y];
  if (node.kind === 'entrance')
    return [x, y, 'entrance', node.featureId, node.projected ? 'projected' : node.entrance];
  return [x, y, node.kind, node.featureId];
}

const compareTuples = (u, v) => {
  for (let i = 0; i < Math.max(u.length, v.length); i += 1) {
    if (u[i] === v[i]) continue;
    if (u[i] === undefined) return -1;
    if (v[i] === undefined) return 1;
    return u[i] < v[i] ? -1 : 1;
  }
  return 0;
};

/**
 * The pack's `routing` block for a list of exported decks (ascending). See
 * docs/architecture/ship_map_pack_routing.md for the schema.
 */
export function buildRouting(
  decks,
  {
    connectors = ROUTING_CONNECTORS,
    problem = (message) => {
      throw new Error(message);
    },
  } = {}
) {
  const shafts = new Map(); // shaft (feature id without its deck) → { lift, stops: [featureId] }
  const routingDecks = [];

  for (const deck of decks) {
    if (!deck.outline) continue;
    const graph = buildDeckGraph(deck, problem, connectors);
    const live = graph.nodes
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => node.alive)
      .sort(
        (u, v) =>
          KIND_ORDER.indexOf(u.node.kind) - KIND_ORDER.indexOf(v.node.kind) ||
          compareTuples(nodeTuple(u.node), nodeTuple(v.node))
      );
    const local = new Map(live.map(({ index }, i) => [index, i]));
    const nodes = live.map(({ node }) => nodeTuple(node));

    const seen = new Set();
    const walk = graph
      .liveEdges()
      .map((e) => {
        const [i, j] = [local.get(e.a), local.get(e.b)].sort((a, b) => a - b);
        const edge = [i, j, round(dist(graph.nodes[e.a].at, graph.nodes[e.b].at))];
        if (e.through) edge.push(e.through);
        return edge;
      })
      .filter(([i, j]) => {
        const key = `${i}-${j}`;
        if (i === j || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(compareTuples);

    for (const { node } of live) {
      if (node.kind !== 'elevator_lobby' && node.kind !== 'stair') continue;
      const shaft = node.featureId.replace(new RegExp(`-${deck.deckNumber}$`), '');
      if (!shafts.has(shaft))
        shafts.set(shaft, { lift: node.kind === 'elevator_lobby', stops: [] });
      shafts.get(shaft).stops.push(node.featureId);
    }
    routingDecks.push({ deckNumber: deck.deckNumber, nodes, walk });
  }

  const ordered = [...shafts.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    walkingSpeedMps: WALKING_SPEED_MPS,
    decks: routingDecks,
    // Every pair of stops is one ride; every neighbouring pair is one flight.
    elevators: ordered
      .filter(([, s]) => s.lift)
      .map(([shaft, s]) => ({ bank: shaft.replace(/^elev-/, ''), stops: s.stops })),
    stairs: ordered.map(([, s]) => s.stops),
  };
}

// The router expands the block; the tests and the site share that one expansion.
export { expandRouting } from '../src/utils/shipRouter.js';
