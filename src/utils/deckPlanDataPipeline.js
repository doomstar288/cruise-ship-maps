/**
 * Deck geometry engine for the Edge-series hull.
 *
 * Coordinates are metres on a plan grid: x runs bow (0) → stern (327) and
 * y runs port (0) → starboard (39). Proportions and venue zoning follow the
 * real ship, but every shape is a programmatic approximation — nothing here is
 * traced from an official (copyrighted) deck plan.
 */

export const SHIP_LENGTH_M = 327;
export const SHIP_BEAM_M = 39;
export const CENTERLINE_Y = SHIP_BEAM_M / 2;

const DEFAULT_BOW_LENGTH_M = 80;
const STERN_ROUNDING_M = 22;
const STERN_TRANSOM_INSET_M = 2.5;
const HULL_MARGIN_M = 0.4;

// Stateroom cross-section, hull → centreline: cabin (incl. Infinite Veranda),
// corridor, inside cabin, then a crew service strip down the middle.
const OUTSIDE_DEPTH_M = 7.2;
const CORRIDOR_M = 1.8;
const INSIDE_DEPTH_M = 5.4;
const STANDARD_CABIN_WIDTH_M = 3.6;
// Below this half-beam the bow is too fine for a cabin row.
const MIN_CABIN_HALF_BEAM_M = 10;

export const VENUE_COLORS = {
  inside: '#5470a0',
  oceanview: '#5b8def',
  veranda: '#3b82f6',
  concierge: '#818cf8',
  aquaClass: '#2dd4bf',
  suite: '#f59e0b',
  iconicSuite: '#fbbf24',
  edgeVilla: '#d97706',
  dining: '#f97316',
  bar: '#a855f7',
  entertainment: '#ec4899',
  pool: '#14b8a6',
  spa: '#10b981',
  shopping: '#e879f9',
  service: '#64748b',
  backOfHouse: '#334155',
  magicCarpet: '#facc15',
};

/**
 * Fore/aft extent of each guest deck. Lower decks follow the full hull; the
 * superstructure steps back toward the top, ending in the small Retreat
 * sundeck on 17. There is no Deck 1 or Deck 13 on the ship.
 */
export const DECK_ENVELOPES = {
  2: { xStart: 12, xEnd: 322, bowLength: 95 },
  3: { xStart: 6, xEnd: 325, bowLength: 88 },
  4: { xStart: 3, xEnd: 327, bowLength: 84 },
  5: { xStart: 1, xEnd: 327 },
  6: { xStart: 0, xEnd: 327 },
  7: { xStart: 0, xEnd: 327 },
  8: { xStart: 0, xEnd: 327 },
  9: { xStart: 0, xEnd: 327 },
  10: { xStart: 0, xEnd: 327 },
  11: { xStart: 16, xEnd: 327, cornerRadius: 4, bridgeWings: { x: [22, 32], overhang: 3 } },
  12: { xStart: 24, xEnd: 327, cornerRadius: 4 },
  14: { xStart: 34, xEnd: 312, cornerRadius: 6 },
  15: { xStart: 40, xEnd: 318, cornerRadius: 6 },
  16: { xStart: 46, xEnd: 252, beamScale: 0.94, cornerRadius: 6 },
  17: { xStart: 76, xEnd: 176, beamScale: 0.7, cornerRadius: 9 },
};

/** The Magic Carpet rides a fixed starboard station; only its deck changes. */
export const MAGIC_CARPET_X = [155, 183];
const MAGIC_CARPET_DEPTH_M = 7.5;

export const CORE_STATIONS = {
  fwd: { x: [82, 94], label: 'Forward' },
  mid: { x: [186, 198], label: 'Midship' },
  aft: { x: [262, 274], label: 'Aft' },
};
export const STERN_STAIR_X = [294, 300];
const CORE_Y = [9, 30];

const round2 = (n) => Math.round(n * 100) / 100;

export function deckEnvelope(level) {
  const envelope = DECK_ENVELOPES[level];
  if (!envelope) throw new Error(`No hull envelope defined for Deck ${level}`);
  return envelope;
}

/** Half the deck's width at station x (0 outside the deck's fore/aft extent). */
export function hullHalfWidth(level, x) {
  const {
    xStart,
    xEnd,
    bowLength = DEFAULT_BOW_LENGTH_M,
    beamScale = 1,
    cornerRadius = 0,
  } = deckEnvelope(level);
  if (x < xStart || x > xEnd) return 0;

  const half = (SHIP_BEAM_M / 2) * beamScale;
  let hw = half;

  if (x < bowLength) {
    const t = x / bowLength;
    hw = Math.min(hw, half * Math.pow(1 - (1 - t) ** 2, 0.75));
  }

  const sternStart = SHIP_LENGTH_M - STERN_ROUNDING_M;
  if (x > sternStart) {
    const t = (x - sternStart) / STERN_ROUNDING_M;
    hw = Math.min(hw, half - STERN_TRANSOM_INSET_M * (1 - Math.sqrt(1 - t * t)));
  }

  if (cornerRadius > 0) {
    const d = Math.min(x - xStart, xEnd - x);
    if (d < cornerRadius) {
      hw = Math.min(hw, half - cornerRadius + Math.sqrt(cornerRadius ** 2 - (cornerRadius - d) ** 2));
    }
  }

  return Math.max(hw, 0);
}

/** Whether a plan point lies on the deck (within `tolerance` metres). */
export function isInsideHull(level, [x, y], tolerance = 0.01) {
  const hw = hullHalfWidth(level, x);
  return hw > 0 && Math.abs(y - CENTERLINE_Y) <= hw + tolerance;
}

function stations(level) {
  const { xStart, xEnd, bowLength = DEFAULT_BOW_LENGTH_M, cornerRadius = 0 } = deckEnvelope(level);
  const xs = new Set([xStart, xEnd]);
  const addRange = (from, to, step) => {
    for (let i = 0; from + i * step <= to + 1e-9; i += 1) xs.add(round2(from + i * step));
  };
  addRange(0, bowLength, 2.5);
  addRange(SHIP_LENGTH_M - STERN_ROUNDING_M, SHIP_LENGTH_M, 2);
  if (cornerRadius) {
    addRange(xStart, xStart + cornerRadius, cornerRadius / 6);
    addRange(xEnd - cornerRadius, xEnd, cornerRadius / 6);
  }
  return [...xs].filter((x) => x >= xStart && x <= xEnd).sort((a, b) => a - b);
}

/** Closed deck outline polygon as [x, y] points, bow → stern along port, back along starboard. */
export function generateHullOutline(level) {
  const { bridgeWings } = deckEnvelope(level);
  let port = [];
  let starboard = [];
  for (const x of stations(level)) {
    const hw = hullHalfWidth(level, x);
    port.push([x, round2(CENTERLINE_Y - hw)]);
    starboard.push([x, round2(CENTERLINE_Y + hw)]);
  }

  if (bridgeWings) {
    const [w1, w2] = bridgeWings.x;
    const addWing = (points, sign) => {
      const edge = (x) => round2(CENTERLINE_Y + sign * hullHalfWidth(level, x));
      const tip = round2(CENTERLINE_Y + sign * (SHIP_BEAM_M / 2 + bridgeWings.overhang));
      const kept = points.filter(([x]) => x < w1 || x > w2);
      kept.push([w1, edge(w1)], [w1, tip], [w2, tip], [w2, edge(w2)]);
      return kept.sort((a, b) => a[0] - b[0]);
    };
    port = addWing(port, -1);
    starboard = addWing(starboard, 1);
  }

  const ring = [...port, ...starboard.reverse()];
  // A deck that comes to a point would otherwise repeat its bow tip.
  const outline = ring.filter(
    (p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]
  );
  outline.push(outline[0]);
  return outline;
}

/** Clip a requested rectangle to the deck, or null if too little of it survives. */
export function clampToHull(level, [x1, x2], [y1, y2]) {
  const { xStart, xEnd } = deckEnvelope(level);
  const cx1 = Math.max(x1, xStart + HULL_MARGIN_M);
  const cx2 = Math.min(x2, xEnd - HULL_MARGIN_M);
  if (cx2 - cx1 < 1) return null;

  // Half-width rises through the bow, holds, then falls at the stern, so its
  // minimum over a span is always at one of the span's ends.
  const inner = Math.min(hullHalfWidth(level, cx1), hullHalfWidth(level, cx2)) - HULL_MARGIN_M;
  const cy1 = Math.max(y1, CENTERLINE_Y - inner);
  const cy2 = Math.min(y2, CENTERLINE_Y + inner);
  if (cy2 - cy1 < 1) return null;

  return [
    [round2(cx1), round2(cy1)],
    [round2(cx2), round2(cy2)],
  ];
}

const centerOf = ([[x1, y1], [x2, y2]]) => [round2((x1 + x2) / 2), round2((y1 + y2) / 2)];

/** A named venue rectangle clipped to the deck. Throws if it cannot fit. */
export function placeVenue(level, { id, name, category, color, x, y = [0, SHIP_BEAM_M], ...rest }) {
  const bounds = clampToHull(level, x, y);
  if (!bounds) throw new Error(`Venue ${id} does not fit inside the Deck ${level} hull`);
  return { id, name, category, color, bounds, center: centerOf(bounds), ...rest };
}

/** The Magic Carpet platform, cantilevered off the starboard side at this deck. */
export function magicCarpetStop(level, fields) {
  const [x1, x2] = MAGIC_CARPET_X;
  const edge = CENTERLINE_Y + Math.max(hullHalfWidth(level, x1), hullHalfWidth(level, x2));
  const bounds = [
    [x1, round2(edge + 0.3)],
    [x2, round2(edge + 0.3 + MAGIC_CARPET_DEPTH_M)],
  ];
  return {
    id: `v${level}-magic-carpet`,
    name: `Magic Carpet (Deck ${level})`,
    category: 'Magic Carpet',
    color: VENUE_COLORS.magicCarpet,
    bounds,
    center: centerOf(bounds),
    side: 'Starboard',
    outboard: true,
    ...fields,
  };
}

/** Elevator lobbies (and the stern stairwell on stateroom decks) down the centreline. */
export function generateCenterlineCore(level, banks = ['fwd', 'mid', 'aft']) {
  const cores = [];
  for (const bank of banks) {
    if (bank === 'stern') {
      const bounds = clampToHull(level, STERN_STAIR_X, [12, 27]);
      if (!bounds) continue;
      cores.push({
        id: `stairs-aft-${level}`,
        name: 'Aft Stairwell',
        category: 'Guest Services',
        color: VENUE_COLORS.service,
        bounds,
        center: centerOf(bounds),
        description: 'Aft stairwell serving the stern stateroom sections.',
        tags: ['Stairs', 'Aft'],
      });
      continue;
    }
    const { x, label } = CORE_STATIONS[bank];
    const bounds = clampToHull(level, x, CORE_Y);
    if (!bounds) continue;
    cores.push({
      id: `elev-${bank}-${level}`,
      name: `${label} Elevators`,
      category: 'Guest Services',
      color: VENUE_COLORS.service,
      bounds,
      center: centerOf(bounds),
      description: `${label} elevator lobby and stairwell.`,
      tags: ['Elevator', 'Stairs', label],
    });
  }
  return cores;
}

/**
 * Stateroom classes. Sizes are only given where the published figure is well
 * established; the exporter drops the undefined ones rather than guessing.
 */
export const CABIN_TYPES = {
  I2: { label: 'Inside', color: VENUE_COLORS.inside },
  O2: { label: 'Oceanview', color: VENUE_COLORS.oceanview },
  PO: { label: 'Panoramic Oceanview', color: VENUE_COLORS.oceanview },
  DO: { label: 'Deluxe Oceanview', color: VENUE_COLORS.oceanview },
  ES: { label: 'Edge Single', color: VENUE_COLORS.veranda, width: 2.8 },
  E3: { label: 'Edge Stateroom with Infinite Veranda', color: VENUE_COLORS.veranda, sqft: 243, verandaSqft: 42 },
  E1: { label: 'Prime Edge Stateroom with Infinite Veranda', color: VENUE_COLORS.veranda, sqft: 243, verandaSqft: 42 },
  SV: { label: 'Sunset Veranda', color: VENUE_COLORS.veranda },
  C2: { label: 'Concierge Class', color: VENUE_COLORS.concierge, sqft: 243, verandaSqft: 42 },
  A1: { label: 'AquaClass', color: VENUE_COLORS.aquaClass, sqft: 243, verandaSqft: 42 },
  S1: { label: 'Sky Suite', suite: true, color: VENUE_COLORS.suite, width: 5.4 },
  AS: { label: 'AquaClass Sky Suite', suite: true, color: VENUE_COLORS.suite, width: 5.4 },
  MS: { label: 'Magic Carpet Sky Suite', suite: true, color: VENUE_COLORS.suite, width: 5.4 },
  SS: { label: 'Sunset Sky Suite', suite: true, color: VENUE_COLORS.suite, width: 5.4 },
  CS: { label: 'Celebrity Suite', suite: true, color: VENUE_COLORS.suite, width: 9, depth: 9 },
  RS: { label: 'Royal Suite', suite: true, color: VENUE_COLORS.suite, width: 12, depth: 9 },
  PS: { label: 'Penthouse Suite', suite: true, color: VENUE_COLORS.suite, width: 14, depth: 9 },
  IC: {
    label: 'Iconic Suite',
    suite: true,
    color: VENUE_COLORS.iconicSuite,
    sqft: 2530,
    verandaSqft: 745,
    description: 'Two-bedroom Iconic Suite perched above the navigation bridge, with a wraparound veranda and private whirlpool.',
  },
  EV: {
    label: 'Edge Villa',
    suite: true,
    color: VENUE_COLORS.edgeVilla,
    sqft: 950,
    verandaSqft: 210,
    description: 'Two-story Edge Villa with a private terrace and plunge pool, part of The Retreat.',
  },
};

/** [from, to] minus the given x ranges (with 1 m clearance), flagging spans that start after a gap. */
function subtractRanges([from, to], avoid) {
  const segments = [];
  let cursor = from;
  let afterGap = false;
  for (const [a, b] of [...avoid].sort((p, q) => p[0] - q[0])) {
    if (b + 1 <= cursor || a - 1 >= to) continue;
    if (a - 1 > cursor) segments.push([cursor, a - 1, afterGap]);
    cursor = Math.max(cursor, b + 1);
    afterGap = true;
  }
  if (cursor < to) segments.push([cursor, to, afterGap]);
  return segments;
}

function cabinRect(level, side, row, x1, x2, depth) {
  const hw = Math.min(hullHalfWidth(level, x1), hullHalfWidth(level, x2)) - HULL_MARGIN_M;
  if (hw < MIN_CABIN_HALF_BEAM_M) return null;
  const inward = side === 'Port' ? 1 : -1;
  const hullEdge = CENTERLINE_Y - inward * hw;

  let near;
  let far;
  if (row === 'outside') {
    near = hullEdge;
    far = hullEdge + inward * depth;
  } else {
    near = hullEdge + inward * (OUTSIDE_DEPTH_M + CORRIDOR_M);
    far = near + inward * INSIDE_DEPTH_M;
    // Keep a service strip clear down the centreline.
    if (inward * (CENTERLINE_Y - far) < 2) return null;
  }
  return [
    [round2(x1), round2(Math.min(near, far))],
    [round2(x2), round2(Math.max(near, far))],
  ];
}

function transomCabins(level, { corner, middle }) {
  const x2 = SHIP_LENGTH_M - HULL_MARGIN_M;
  const x1 = x2 - OUTSIDE_DEPTH_M;
  const hw = Math.min(hullHalfWidth(level, x1), hullHalfWidth(level, x2)) - HULL_MARGIN_M;
  const yA = CENTERLINE_Y - hw;
  const yB = CENTERLINE_Y + hw;
  const cornerWidth = CABIN_TYPES[corner].width ?? STANDARD_CABIN_WIDTH_M;
  const middleWidth = CABIN_TYPES[middle].width ?? STANDARD_CABIN_WIDTH_M;
  const count = Math.floor((yB - yA - 2 * cornerWidth) / middleWidth);
  const slack = (yB - yA - 2 * cornerWidth - count * middleWidth) / 2;

  const cells = [[corner, yA, yA + cornerWidth]];
  for (let i = 0; i < count; i += 1) {
    const start = yA + cornerWidth + slack + i * middleWidth;
    cells.push([middle, start, start + middleWidth]);
  }
  cells.push([corner, yB - cornerWidth, yB]);

  return cells.map(([code, c1, c2]) => ({
    code,
    row: 'transom',
    side: (c1 + c2) / 2 < CENTERLINE_Y ? 'Port' : 'Starboard',
    bounds: [
      [round2(x1), round2(c1)],
      [round2(x2), round2(c2)],
    ],
  }));
}

const ROW_ORDER = { outside: 0, inside: 1, transom: 2 };

/**
 * Numbers cabins bow → stern: deck prefix + three digits, even numbers to port
 * and odd to starboard. (Low-forward is the ship's own scheme; the port/even
 * split is this dataset's convention.)
 */
function numberCabins(level, cabins) {
  let port = level * 1000 + 100;
  let starboard = level * 1000 + 101;
  const sorted = [...cabins].sort(
    (a, b) => centerOf(a.bounds)[0] - centerOf(b.bounds)[0] || ROW_ORDER[a.row] - ROW_ORDER[b.row]
  );

  const built = sorted.map((cabin) => {
    let number = cabin.number;
    if (!number) {
      if (cabin.side === 'Port') {
        number = port;
        port += 2;
      } else {
        number = starboard;
        starboard += 2;
      }
    }
    const type = CABIN_TYPES[cabin.code];
    const side = cabin.side;
    return {
      id: `c${level}-${number}`,
      name: type.suite ? `${type.label} ${number}` : `Stateroom ${number} (${type.label})`,
      label: String(number),
      category: type.suite ? 'Suites' : 'Staterooms',
      color: type.color,
      bounds: cabin.bounds,
      center: centerOf(cabin.bounds),
      description: type.description ?? `${type.label} on Deck ${level}, ${side.toLowerCase()} side.`,
      cabinClass: cabin.code,
      sqft: type.sqft,
      verandaSqft: type.verandaSqft,
      ada: Boolean(cabin.ada),
      side,
      connecting: null,
    };
  });

  // Mark a sprinkling of neighbouring standard cabins as connecting pairs.
  for (const side of ['Port', 'Starboard']) {
    const row = built.filter(
      (c, i) => c.side === side && c.category === 'Staterooms' && sorted[i].row === 'outside'
    );
    for (let i = 3; i + 1 < row.length; i += 10) {
      if (row[i].bounds[1][0] === row[i + 1].bounds[0][0]) {
        row[i].connecting = row[i + 1].label;
        row[i + 1].connecting = row[i].label;
      }
    }
  }
  return built;
}

/**
 * Lays out stateroom rows between `range` stations.
 * @param {number} level
 * @param {object} options
 * @param {[number, number]} options.range - fore/aft stations to fill
 * @param {Array<[number, number]>} [options.avoid] - x spans kept clear on every row (elevator cores)
 * @param {Array<[number, number]>} [options.starboardOutsideAvoid] - spans kept clear on the starboard hull row only
 * @param {(ctx: {x: number, side: string, row: string}) => string | null} options.typeFor - cabin class code, or null for no cabin
 * @param {{corner: string, middle: string}} [options.transom] - stern-facing cabins across the transom
 * @param {Array<object>} [options.fixedCabins] - pre-placed cabins ({code, side, row, bounds, number?}) numbered with the rest
 */
export function generateStaterooms(
  level,
  { range, avoid = [], starboardOutsideAvoid = [], typeFor, transom, fixedCabins = [] }
) {
  const cabins = [];
  for (const side of ['Port', 'Starboard']) {
    for (const row of ['outside', 'inside']) {
      const rowAvoid =
        row === 'outside' && side === 'Starboard' ? [...avoid, ...starboardOutsideAvoid] : avoid;
      for (const [a, b, afterGap] of subtractRanges(range, rowAvoid)) {
        let x = a;
        let first = true;
        while (x < b) {
          const code = typeFor({ x, side, row });
          const type = code && CABIN_TYPES[code];
          if (!type) {
            x += 1;
            continue;
          }
          const width = type.width ?? STANDARD_CABIN_WIDTH_M;
          if (x + width > b) break;
          const bounds = cabinRect(level, side, row, x, x + width, type.depth ?? OUTSIDE_DEPTH_M);
          if (!bounds) {
            x += 1;
            continue;
          }
          cabins.push({ code, side, row, bounds, ada: first && afterGap && row === 'outside' });
          first = false;
          x += width;
        }
      }
    }
  }
  if (transom) cabins.push(...transomCabins(level, transom));
  cabins.push(...fixedCabins);
  return numberCabins(level, cabins);
}

/** Crew service strips down the centreline between stateroom rows (full-beam stations only). */
export function generateServiceStrips(level, { range, avoid = [] }) {
  const fullBeam = (x) => hullHalfWidth(level, x) >= 19.2;
  return subtractRanges(range, avoid)
    .map(([a, b]) => {
      let start = a;
      let end = b;
      while (start < end && !fullBeam(start)) start += 1;
      while (end > start && !fullBeam(end)) end -= 1;
      return end - start >= 6 ? [start, end] : null;
    })
    .filter(Boolean)
    .map(([x1, x2], i) => {
      const bounds = [
        [round2(x1), 15.8],
        [round2(x2), 23.2],
      ];
      return {
        id: `service-${level}-${i + 1}`,
        name: 'Crew Service Area',
        category: 'Crew & Service',
        color: VENUE_COLORS.backOfHouse,
        bounds,
        center: centerOf(bounds),
        description: 'Back-of-house pantries, linen stores and service lifts. Crew only.',
        tags: ['Crew Only'],
        hideLabel: true,
      };
    });
}

/** Plain-language position of a plan point, e.g. "Midship · Starboard side". */
export function describeLocation([x, y]) {
  const along = x < SHIP_LENGTH_M / 3 ? 'Forward' : x < (2 * SHIP_LENGTH_M) / 3 ? 'Midship' : 'Aft';
  let across;
  if (y > SHIP_BEAM_M) across = 'Starboard side (outboard)';
  else if (y < 0) across = 'Port side (outboard)';
  else if (y < CENTERLINE_Y - 4.5) across = 'Port side';
  else if (y > CENTERLINE_Y + 4.5) across = 'Starboard side';
  else across = 'Centerline';
  return `${along} · ${across}`;
}
