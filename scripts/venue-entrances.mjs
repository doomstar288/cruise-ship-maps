/**
 * Venue entrances for Ship Map Pack v1 (roadmap P1.4).
 *
 * Big rooms have doors, not centres: a route that ends at the middle of The
 * Theatre overstates the walk. Large venues get an optional
 * `entrances: [[x, y], …]` in pack coordinates. Routing targets the nearest
 * one; the map pin stays at `center`.
 *
 * Entrances are DERIVED from the synthetic layout, never traced from an official
 * plan. The deck grid has no explicit passage features on public decks: walkways
 * are the gaps the generator leaves between rectangles (the 2 m cross-passages
 * either side of each elevator core and between venue blocks, the stateroom
 * corridors) plus the elevator lobbies and the Grand Plaza atrium. So an edge
 * is "corridor-facing" at a point when a ray cast outward from it, before it
 * reaches the hull outline,
 *
 *   - meets circulation (an elevator lobby, stairwell or atrium) within
 *     MAX_PASSAGE_M,
 *   - crosses a free gap MIN_PASSAGE_M–MAX_PASSAGE_M wide and meets another
 *     feature, or
 *   - runs at least LONG_CORRIDOR_M down a stateroom corridor.
 *
 * That rules out hull-side edges (including the bow wedges a clipped rectangle
 * leaves beside it) and edges shared with a neighbour, whose seam is under a
 * metre. Doors go at the midpoint of each open run along the edge, or at its
 * quarter points when the run is long enough for two.
 *
 * Operates on exported pack features only, so it works for any ship.
 */

/** Anything larger than this footprint is a "large venue". */
export const LARGE_VENUE_AREA_M2 = 800;

/**
 * Venues that always get entrances, whatever their size: the roadmap's list
 * (Theatre levels, main dining rooms, The Bazaar family, Pool Club, Oceanview
 * Café). Cosmopolitan, Cyprus and Spice Café fall under the area threshold.
 * The exporter tests assert every one of these ends up with an entrance.
 */
export const ENTRANCE_INCLUDE_IDS = new Set([
  'v3-theatre',
  'v4-theatre',
  'v5-theatre',
  'v3-normandie',
  'v3-tuscan',
  'v4-cosmopolitan',
  'v4-cyprus',
  'v4-mosaic',
  'v5-bazaar-market',
  'v5-spice-cafe',
  'v6-bazaar',
  'v14-pool-club',
  'v14-oceanview-cafe',
]);

/**
 * Hand-authored entrances, keyed by feature id, for venues the geometry can't
 * infer. Each is marked here rather than in the pack; the tests hold them to the
 * same corridor-edge rules as derived ones. Empty today.
 */
export const ENTRANCE_OVERRIDES = {};

/** Narrower gaps are drawing seams between neighbours, not walkways. */
export const MIN_PASSAGE_M = 1.5;
/** Widest free space a ray may cross to a lobby or neighbour: a lobby foyer. */
export const MAX_PASSAGE_M = 20;
/**
 * A ray that runs this far before meeting anything is travelling down a
 * longitudinal stateroom corridor. A shorter run to the hull faces bow or
 * hull-side deck.
 */
export const LONG_CORRIDOR_M = 40;
/** An entrance keeps this far from the hull outline. */
export const HULL_CLEARANCE_M = 1;
/** Open runs this long get two doors (at the quarter points) instead of one. */
const TWO_DOOR_RUN_M = 16;
/** Shortest open run that can hold a door. */
const MIN_DOOR_RUN_M = 1.5;
/** Closed breaks this short inside an open run are seams, not walls. */
const SEAM_BRIDGE_M = 1.5;
const SAMPLE_STEP_M = 0.25;
const EPS = 1e-6;

const round = (n) => Math.round(n * 100) / 100;

/** Atrium-style open circulation: walked through, never given doors of its own. */
export const isCirculation = (f) =>
  f.featureType === 'elevator' ||
  f.featureType === 'stairwell' ||
  (f.featureType === 'venue' && (f.tags ?? []).some((t) => /^atrium$/i.test(t)));

const rectOf = ({ bounds: [[x1, y1], [x2, y2]] }) => ({
  x1: Math.min(x1, x2),
  y1: Math.min(y1, y2),
  x2: Math.max(x1, x2),
  y2: Math.max(y1, y2),
});

const area = (f) => {
  const r = rectOf(f);
  return (r.x2 - r.x1) * (r.y2 - r.y1);
};

/** Whether a feature is a large venue under the documented rule. */
export function isLargeVenue(feature) {
  if (feature.featureType !== 'venue' || isCirculation(feature)) return false;
  return ENTRANCE_INCLUDE_IDS.has(feature.id) || area(feature) >= LARGE_VENUE_AREA_M2;
}

// ------------------------------------------------------------------ geometry

/** Even-odd point-in-polygon for a closed [x, y] ring. */
export function insidePolygon([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance from a point to a polyline ring. */
export function distanceToRing([px, py], ring) {
  let best = Infinity;
  for (let i = 1; i < ring.length; i += 1) {
    const [ax, ay] = ring[i - 1];
    const [bx, by] = ring[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

export const insideRect = ([x, y], r, tol = 0) =>
  x >= r.x1 - tol && x <= r.x2 + tol && y >= r.y1 - tol && y <= r.y2 + tol;

/** The four edges of a rectangle, each with its outward unit normal. */
function edgesOf(r) {
  return [
    { axis: 'y', fixed: r.x1, from: r.y1, to: r.y2, normal: [-1, 0] }, // forward
    { axis: 'y', fixed: r.x2, from: r.y1, to: r.y2, normal: [1, 0] }, // aft
    { axis: 'x', fixed: r.y1, from: r.x1, to: r.x2, normal: [0, -1] }, // port
    { axis: 'x', fixed: r.y2, from: r.x1, to: r.x2, normal: [0, 1] }, // starboard
  ];
}

const pointOn = (edge, s) => (edge.axis === 'y' ? [edge.fixed, s] : [s, edge.fixed]);

/**
 * What an outward ray from `p` meets first: `{ kind: 'hull' | 'feature' |
 * 'circulation' | 'none', distance }`.
 */
function castRay(p, normal, self, others, outline) {
  let hit = { kind: 'none', distance: Infinity };
  const [nx, ny] = normal;
  for (const { feature, rect } of others) {
    // Perpendicular span must strictly contain the ray, so a neighbour that only
    // touches the ray at a corner does not count as facing this edge.
    const across =
      nx !== 0
        ? p[1] > rect.y1 + EPS && p[1] < rect.y2 - EPS
        : p[0] > rect.x1 + EPS && p[0] < rect.x2 - EPS;
    if (!across) continue;
    let d;
    if (nx > 0) d = rect.x1 - p[0];
    else if (nx < 0) d = p[0] - rect.x2;
    else if (ny > 0) d = rect.y1 - p[1];
    else d = p[1] - rect.y2;
    // A feature the ray starts inside (an atrium this edge borders) is distance 0.
    const startsInside = insideRect([p[0] + nx * 0.05, p[1] + ny * 0.05], rect);
    if (startsInside) d = 0;
    else if (d < -EPS) continue;
    if (d < hit.distance)
      hit = { kind: isCirculation(feature) ? 'circulation' : 'feature', distance: d };
  }

  const hull = rayToRing(p, normal, outline);
  return hull <= hit.distance ? { kind: 'hull', distance: hull } : hit;
}

/** Distance along an axis-aligned ray from `p` to the first crossing of `ring`. */
function rayToRing([px, py], [nx, ny], ring) {
  let best = Infinity;
  for (let i = 1; i < ring.length; i += 1) {
    const [ax, ay] = ring[i - 1];
    const [bx, by] = ring[i];
    if (nx !== 0) {
      if ((ay - py) * (by - py) > 0 || ay === by) continue;
      const x = ax + ((py - ay) * (bx - ax)) / (by - ay);
      const d = (x - px) * nx;
      if (d >= 0) best = Math.min(best, d);
    } else {
      if ((ax - px) * (bx - px) > 0 || ax === bx) continue;
      const y = ay + ((px - ax) * (by - ay)) / (bx - ax);
      const d = (y - py) * ny;
      if (d >= 0) best = Math.min(best, d);
    }
  }
  return best;
}

/** Whether a door at `p` on this edge would open onto circulation. */
function opensOntoCirculation(p, edge, self, others, outline) {
  if (distanceToRing(p, outline) < HULL_CLEARANCE_M) return false;
  const hit = castRay(p, edge.normal, self, others, outline);
  if (hit.kind === 'circulation') return hit.distance <= MAX_PASSAGE_M;
  // Ran the length of a corridor before meeting anything.
  if (hit.distance >= LONG_CORRIDOR_M) return true;
  // Otherwise the hull ahead means hull-side deck, and a neighbour means a
  // passage only if the gap is walkable.
  return hit.kind === 'feature' && hit.distance >= MIN_PASSAGE_M && hit.distance <= MAX_PASSAGE_M;
}

/** Contiguous open stretches along an edge, as [from, to] parameter ranges. */
function openRuns(edge, self, others, outline) {
  const runs = [];
  let start = null;
  let last = null;
  for (let s = edge.from + SAMPLE_STEP_M / 2; s < edge.to; s += SAMPLE_STEP_M) {
    if (opensOntoCirculation(pointOn(edge, s), edge, self, others, outline)) {
      if (start === null) start = s;
      last = s;
    } else if (start !== null) {
      runs.push([start, last]);
      start = null;
    }
  }
  if (start !== null) runs.push([start, last]);
  // A neighbour's drawing seam (under a metre) is not a wall: bridge it.
  const merged = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    if (prev && run[0] - prev[1] <= SEAM_BRIDGE_M) prev[1] = run[1];
    else merged.push([...run]);
  }
  return merged.filter(([a, b]) => b - a >= MIN_DOOR_RUN_M);
}

/**
 * Entrances for one venue: the midpoint of each corridor-facing run, or its
 * quarter points when the run is long enough for two doors.
 */
export function deriveEntrances(feature, deckFeatures, outline) {
  if (!outline || outline.length < 4) return [];
  const self = rectOf(feature);
  const others = deckFeatures
    .filter((f) => f !== feature && f.id !== feature.id && Array.isArray(f.bounds))
    .map((f) => ({ feature: f, rect: rectOf(f) }));

  const entrances = [];
  for (const edge of edgesOf(self)) {
    for (const [a, b] of openRuns(edge, self, others, outline)) {
      const doors =
        b - a >= TWO_DOOR_RUN_M ? [a + (b - a) / 4, a + (3 * (b - a)) / 4] : [(a + b) / 2];
      for (const s of doors) {
        const [x, y] = pointOn(edge, s);
        entrances.push([round(x), round(y)]);
      }
    }
  }
  return entrances;
}

/**
 * Adds `entrances` to every large venue on a deck. Features without any are
 * left untouched, so the key is omitted rather than emitted as `[]`.
 */
export function withEntrances(features, outline) {
  return features.map((feature) => {
    if (!isLargeVenue(feature)) return feature;
    const entrances = ENTRANCE_OVERRIDES[feature.id] ?? deriveEntrances(feature, features, outline);
    return entrances.length ? { ...feature, entrances } : feature;
  });
}
