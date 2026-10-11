#!/usr/bin/env node
/**
 * Official deck plan SVG checker.
 *
 * Reads Celebrity's own per-deck SVGs (saved by hand into a git-ignored folder), pulls out the
 * text labels (venue names, stateroom numbers, stairs and lifts) and where they sit, and checks
 * them against the published pack: is each venue on the deck and in the fore/aft zone the pack
 * puts it, and do the pack's stateroom numbers match the official ones?
 *
 * Only facts leave this script: names, deck, zone, side, stateroom numbers. The official
 * drawings themselves stay in the git-ignored folder and never reach the repo or the packs
 * (see docs/research/official_deck_plan_svgs.md for why).
 *
 * Usage:
 *   node scripts/official-deck-svg.mjs --ship-id celebrity-xcel
 *   node scripts/official-deck-svg.mjs --ship-id celebrity-xcel --dir path/to/svgs --json
 *   node scripts/official-deck-svg.mjs --ship-id celebrity-xcel --bow top --port right
 *   node scripts/official-deck-svg.mjs --ship-id celebrity-xcel --write
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const officialDir = (shipId) => resolve(REPO_ROOT, `.official-deck-plans/${shipId}`);
export const factsPath = (shipId) =>
  resolve(REPO_ROOT, `src/data/ships/${shipId}/official-facts.json`);
export const packPath = (shipId) => resolve(REPO_ROOT, `public/v1/ships/${shipId}/plan.json`);

/** A label this close (as a fraction of ship length) to a zone boundary may sit in either zone. */
export const ZONE_BOUNDARY_TOLERANCE = 0.04;

// ------------------------------------------------------------------ SVG parsing

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** Composes two SVG affine matrices [a b c d e f]: the result applies `inner` first. */
function multiply([a1, b1, c1, d1, e1, f1], [a2, b2, c2, d2, e2, f2]) {
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Parses an SVG `transform` attribute (translate, scale, rotate, matrix) into one matrix. */
export function parseTransform(value) {
  let m = IDENTITY;
  if (!value) return m;
  for (const [, fn, rawArgs] of value.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const n = rawArgs
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    let next;
    if (fn === 'matrix' && n.length === 6) next = n;
    else if (fn === 'translate') next = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
    else if (fn === 'scale') next = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const r = ((n[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      next = multiply(
        multiply([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]),
        [1, 0, 0, 1, -cx, -cy]
      );
    } else continue;
    m = multiply(m, next);
  }
  return m;
}

const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];

function parseAttributes(raw) {
  const attrs = {};
  for (const [, name, dq, sq] of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[name] = dq ?? sq;
  }
  return attrs;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const cp =
        code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** First number of an SVG length list such as `x="12.5 18 24"`. */
const firstNumber = (value) => {
  const n = parseFloat(
    String(value ?? '')
      .trim()
      .split(/[\s,]+/)[0]
  );
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Pulls every `<text>` element's string and position (in viewBox units, after all
 * ancestor transforms) out of an SVG document. A label split over several `<tspan>`s
 * ("MAST" / "GRILL") comes back as one label at the first line's position.
 *
 * Each label also carries `u`, the unit vector its text reads along, `v`, the unit vector
 * from one line of text to the next, and `size`, its font size in viewBox units, so that
 * names Celebrity sets as separate `<text>` lines can be stitched back together.
 *
 * @param {string} svg
 * @returns {{ viewBox: { minX: number, minY: number, width: number, height: number } | null,
 *             labels: Label[] }}
 *
 * @typedef {{ text: string, x: number, y: number, u: [number, number], v: [number, number],
 *             size: number }} Label
 */
export function parseSvgLabels(svg) {
  const labels = [];
  const stack = [IDENTITY];
  const sizes = [undefined]; // inherited font-size attribute, parallel to `stack`
  let viewBox = null;
  let current = null; // the <text> being read: { matrix, x, y, parts }
  // Comments are skipped and CDATA read as text as the tokenizer meets them, rather than
  // stripped beforehand, so no comment can survive a partial strip.
  const tagRe =
    /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)|<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let skipDepth = 0; // inside <defs>, <style>, <title> etc. nothing is drawn as a label

  for (const [whole, cdata, closing, rawName, rawAttrs, selfClosing, plainText] of svg.matchAll(
    tagRe
  )) {
    if (whole.startsWith('<!--')) continue;
    const textNode = cdata ?? plainText;
    if (textNode !== undefined) {
      if (current && skipDepth === 0) current.parts.push(textNode);
      continue;
    }
    const name = rawName.replace(/^svg:/, '').toLowerCase();
    if (name.startsWith('?') || name.startsWith('!')) continue;
    const skipped = [
      'defs',
      'style',
      'title',
      'desc',
      'metadata',
      'script',
      'symbol',
      'clippath',
      'mask',
    ].includes(name);

    if (closing) {
      if (skipped) skipDepth = Math.max(0, skipDepth - 1);
      if (name === 'tspan' && current) current.parts.push(' ');
      if (name === 'text' && current) {
        const text = decodeEntities(current.parts.join('')).replace(/\s+/g, ' ').trim();
        if (text) {
          const [a, b, c, d] = current.matrix;
          const [x, y] = apply(current.matrix, current.x ?? 0, current.y ?? 0);
          const ul = Math.hypot(a, b) || 1;
          const vl = Math.hypot(c, d) || 1;
          labels.push({
            text,
            x,
            y,
            u: [a / ul, b / ul],
            v: [c / vl, d / vl],
            size: current.size === undefined ? undefined : current.size * vl,
          });
        }
        current = null;
      }
      if (stack.length > 1) {
        stack.pop();
        sizes.pop();
      }
      continue;
    }

    const attrs = parseAttributes(rawAttrs);
    if (name === 'svg' && !viewBox && attrs.viewBox) {
      const [minX, minY, width, height] = attrs.viewBox
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if ([minX, minY, width, height].every(Number.isFinite))
        viewBox = { minX, minY, width, height };
    }
    const matrix = multiply(stack[stack.length - 1], parseTransform(attrs.transform));
    const size = firstNumber(attrs['font-size']) ?? sizes[sizes.length - 1];

    if (name === 'text') {
      current = { matrix, size, x: firstNumber(attrs.x), y: firstNumber(attrs.y), parts: [] };
    } else if (name === 'tspan' && current) {
      // A tspan only supplies the label's position when the <text> itself has none.
      if (current.x === undefined && current.parts.join('').trim() === '') {
        const local = parseTransform(attrs.transform);
        const tx = firstNumber(attrs.x);
        const ty = firstNumber(attrs.y);
        if (tx !== undefined || ty !== undefined) {
          [current.x, current.y] = apply(local, tx ?? 0, ty ?? 0);
        }
      }
    }

    if (selfClosing) continue;
    if (skipped) skipDepth += 1;
    stack.push(matrix);
    sizes.push(size);
  }
  // Text sized only by a stylesheet gets the document's typical label size: Celebrity sets
  // most labels' size inline and the stylesheet-sized ones match it.
  const known = labels
    .map((l) => l.size)
    .filter((n) => n !== undefined)
    .sort((a, b) => a - b);
  const typical = known.length ? known[Math.floor(known.length / 2)] : 16;
  for (const l of labels) l.size ??= typical;
  return { viewBox, labels };
}

// ------------------------------------------------------------------ deck files

const DECK_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/** `deck-fourteen.svg` (Celebrity's naming) or `deck-14.svg` → 14. */
export function deckNumberFromFilename(filename) {
  const m = /deck[-_ ]?([a-z]+|\d+)\.svg$/i.exec(filename);
  if (!m) return null;
  const token = m[1].toLowerCase();
  return /^\d+$/.test(token) ? Number(token) : (DECK_WORDS[token] ?? null);
}

// ------------------------------------------------------------------ labels → facts

/**
 * What a label is. Stateroom numbers carry their deck as a prefix (6101, 10122). Labels
 * naming lifts or stairs are circulation, and restroom signs are their own kind (the pack
 * names restrooms generically). Other text with a word in it is a venue or area name.
 */
export function classifyLabel(text, deckNumber) {
  const t = text.trim();
  if (/^\d{4,5}$/.test(t)) return t.startsWith(String(deckNumber)) ? 'cabin' : 'other';
  if (/\b(elevators?|lifts?)\b/i.test(t)) return 'elevator';
  if (/\b(stairs?|stairwell|staircase)\b/i.test(t)) return 'stairs';
  if (/^(gents|ladies|wc|men|women|restrooms?)$/i.test(t)) return 'restroom';
  if (!/[a-z]{2,}/i.test(t)) return 'other'; // legend letters, icons, stray digits
  return 'venue';
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/**
 * Stitches names set as separate `<text>` lines back together: "IL SECONDO" over "BACIO",
 * "THE" / "POOL" / "CLUB". Two venue labels join when they read the same way, sit one line
 * apart (0.6–1.3 font sizes along the line-to-line direction) and overlap along the reading
 * direction by at least a quarter of the shorter line. Lines join top line first.
 */
export function mergeLines(labels, deckNumber) {
  const words = labels.filter((l) => classifyLabel(l.text, deckNumber) === 'venue');
  const rest = labels.filter((l) => classifyLabel(l.text, deckNumber) !== 'venue');
  const parent = words.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const [a, b] = [words[i], words[j]];
      if (dot(a.u, b.u) < 0.99) continue;
      const delta = [b.x - a.x, b.y - a.y];
      const size = Math.max(a.size, b.size);
      const lineGap = Math.abs(dot(delta, a.v));
      if (lineGap < 0.6 * size || lineGap > 1.3 * size) continue;
      // The lines must overlap along the reading direction (text starts at x, y and runs
      // roughly 0.6 font sizes per character), as a stacked name's lines do; neighbours
      // that merely touch end to end don't.
      const [aStart, bStart] = [dot([a.x, a.y], a.u), dot([b.x, b.y], a.u)];
      const [aEnd, bEnd] = [
        aStart + 0.6 * a.size * a.text.length,
        bStart + 0.6 * b.size * b.text.length,
      ];
      const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
      if (overlap < 0.25 * Math.min(aEnd - aStart, bEnd - bStart)) continue;
      parent[find(j)] = find(i);
    }
  }
  const groups = new Map();
  words.forEach((w, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(w);
  });
  const merged = [...groups.values()].map((lines) => {
    const ordered = [...lines].sort((p, q) => dot([p.x, p.y], p.v) - dot([q.x, q.y], q.v));
    const xs = ordered.map((l) => l.x);
    const ys = ordered.map((l) => l.y);
    return {
      ...ordered[0],
      text: ordered.map((l) => l.text).join(' '),
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  });
  return [...merged, ...rest];
}

/** Mean of the values, or NaN when there are none. */
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;

const SIDES = { left: ['x', -1], right: ['x', 1], top: ['y', -1], bottom: ['y', 1] };

/**
 * Works out which way the drawings face from the stateroom numbers: Celebrity numbers
 * staterooms upward from bow to stern, odd to port and even to starboard. The ship's long
 * axis is the one its staterooms spread along. Returns null for a direction it can't tell.
 *
 * @param {{ deckNumber: number, labels: Label[] }[]} decks
 * @returns {{ bow: 'left' | 'right' | 'top' | 'bottom' | null,
 *             port: 'left' | 'right' | 'top' | 'bottom' | null }}
 */
export function calibrateOrientation(decks) {
  const cabinDecks = decks
    .map(({ deckNumber, labels }) =>
      labels.filter((l) => classifyLabel(l.text, deckNumber) === 'cabin')
    )
    .filter((cabins) => cabins.length >= 4);
  if (!cabinDecks.length) return { bow: null, port: null };

  const spread = (axis) =>
    mean(
      cabinDecks.map((c) => Math.max(...c.map((l) => l[axis])) - Math.min(...c.map((l) => l[axis])))
    );
  const along = spread('x') >= spread('y') ? 'x' : 'y';
  const across = along === 'x' ? 'y' : 'x';

  let slopeVotes = 0;
  const odd = [];
  const even = [];
  for (const cabins of cabinDecks) {
    const ps = cabins.map((c) => c[along]);
    const seqs = cabins.map((c) => Number(c.text) % 1000);
    const mp = mean(ps);
    const ms = mean(seqs);
    slopeVotes += Math.sign(ps.reduce((s, p, i) => s + (p - mp) * (seqs[i] - ms), 0));
    for (const c of cabins) (Number(c.text) % 2 ? odd : even).push(c[across]);
  }
  const low = { x: 'left', y: 'top' };
  const high = { x: 'right', y: 'bottom' };
  return {
    // Numbers rise toward the stern, so the bow is at the low end when the slope is positive.
    bow: slopeVotes > 0 ? low[along] : slopeVotes < 0 ? high[along] : null,
    port: odd.length && even.length ? (mean(odd) < mean(even) ? low[across] : high[across]) : null,
  };
}

/** Fraction of ship length from the bow (0) to the stern (1) → fwd / mid / aft thirds. */
export const zoneOf = (t) => (t < 1 / 3 ? 'fwd' : t < 2 / 3 ? 'mid' : 'aft');

const ZONE_ORDER = ['fwd', 'mid', 'aft'];

/** Whether two zones agree, allowing the neighbouring zone when `t` sits on their boundary. */
export function zonesAgree(officialT, packZone) {
  if (zoneOf(officialT) === packZone) return true;
  const i = ZONE_ORDER.indexOf(packZone);
  return [1 / 3, 2 / 3].some(
    (edge, k) => Math.abs(officialT - edge) <= ZONE_BOUNDARY_TOLERANCE && (i === k || i === k + 1)
  );
}

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Turns one deck's labels into facts. `t` runs bow (0) to stern (1) across the hull's
 * length; `side` is port / starboard / center by which third of the beam the label sits in.
 *
 * @param {{ deckNumber: number, labels: Label[] }} deck
 * @param {{ bow: string, port: string,
 *           hull: { minX: number, maxX: number, minY: number, maxY: number } }} frame
 */
export function deckFacts({ deckNumber, labels }, { bow, port, hull }) {
  const fraction = (side, p) => {
    const [axis, sign] = SIDES[side];
    const [min, max] = axis === 'x' ? [hull.minX, hull.maxX] : [hull.minY, hull.maxY];
    const f = (p[axis] - min) / (max - min);
    return Math.min(1, Math.max(0, sign < 0 ? f : 1 - f));
  };
  const along = (p) => fraction(bow, p); // 0 = bow, 1 = stern
  const across = (p) => fraction(port, p); // 0 = port rail, 1 = starboard rail
  const sideOf = (p) => {
    const a = across(p);
    return a < 1 / 3 ? 'port' : a > 2 / 3 ? 'starboard' : 'center';
  };

  const facts = {
    deckNumber,
    venues: [],
    elevators: [],
    stairs: [],
    cabins: { port: [], starboard: [] },
  };
  for (const label of mergeLines(labels, deckNumber)) {
    const kind = classifyLabel(label.text, deckNumber);
    if (kind === 'other' || kind === 'restroom') continue;
    if (kind === 'cabin') {
      // Side comes from where it's drawn, since a few suites break odd-to-port; parity only
      // settles the stern-facing staterooms drawn near the centreline.
      const a = across(label);
      const odd = Number(label.text) % 2 === 1;
      const side = a < 0.4 || (a <= 0.6 && odd) ? 'port' : 'starboard';
      facts.cabins[side].push(Number(label.text));
      continue;
    }
    const t = round2(along(label));
    const fact = { name: label.text, t, zone: zoneOf(t), side: sideOf(label) };
    if (kind === 'venue') facts.venues.push(fact);
    else facts[kind === 'elevator' ? 'elevators' : 'stairs'].push(fact);
  }
  facts.cabins.port.sort((a, b) => a - b);
  facts.cabins.starboard.sort((a, b) => a - b);
  facts.venues.sort((a, b) => a.t - b.t || a.name.localeCompare(b.name));
  return facts;
}

const boxOf = (viewBox) => ({
  minX: viewBox.minX,
  maxX: viewBox.minX + viewBox.width,
  minY: viewBox.minY,
  maxY: viewBox.minY + viewBox.height,
});

/**
 * Each deck's hull frame in drawing units. Celebrity crops every deck from one shared
 * drawing, so the decks line up along the ship (the lift banks sit at the same place on
 * every deck) while each sits in its own column across it. The ship's length is therefore
 * the union of all the decks' viewBoxes along the long axis (the longest deck spans it),
 * and each deck's beam is its own viewBox across the short axis.
 *
 * Without viewBoxes, the spread of all labels, padded slightly, stands in for both.
 *
 * @param {{ deckNumber: number, labels: Label[], viewBox: object | null }[]} decks
 * @param {'x' | 'y'} alongAxis
 * @returns {Map<number, { minX: number, maxX: number, minY: number, maxY: number }>}
 */
export function hullFrames(decks, alongAxis) {
  const frames = new Map();
  const boxes = decks.filter((d) => d.viewBox).map((d) => boxOf(d.viewBox));
  const [lo, hi] = alongAxis === 'x' ? ['minX', 'maxX'] : ['minY', 'maxY'];
  if (boxes.length === decks.length) {
    const length = {
      [lo]: Math.min(...boxes.map((b) => b[lo])),
      [hi]: Math.max(...boxes.map((b) => b[hi])),
    };
    for (const d of decks) frames.set(d.deckNumber, { ...boxOf(d.viewBox), ...length });
    return frames;
  }
  const pts = decks.flatMap(({ deckNumber, labels }) =>
    labels.filter((l) => classifyLabel(l.text, deckNumber) !== 'other')
  );
  if (pts.length < 8) throw new Error('Cannot tell the hull extent: too few labels and no viewBox');
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const padX = (maxX - minX) * (alongAxis === 'x' ? 0.03 : 0.08);
  const padY = (maxY - minY) * (alongAxis === 'y' ? 0.03 : 0.08);
  const frame = { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
  for (const d of decks) frames.set(d.deckNumber, frame);
  return frames;
}

// ------------------------------------------------------------------ pack comparison

/** Folds a venue name for matching: case, accents, "the", "&"/"and", punctuation. */
export function normalizeName(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|celebrity)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAMED_TYPES = new Set(['venue', 'poi']);

/** Every venue/POI in the pack keyed by normalized name and alias. */
function packNameIndex(pack) {
  const index = new Map();
  for (const deck of pack.decks) {
    for (const f of deck.features) {
      if (!NAMED_TYPES.has(f.featureType)) continue;
      for (const n of [f.name, ...(f.aliases ?? [])]) {
        const key = normalizeName(n);
        if (!key) continue;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ deckNumber: deck.deckNumber, feature: f });
      }
    }
  }
  return index;
}

/**
 * Pack venues for an official name: an exact name or alias first, then the same words in
 * another order, else ones whose name extends it or that it extends word by word
 * ("Mast Grill" ↔ "Mast Grill & Bar"). A one-word name only matches exactly, so "Mast"
 * never pulls in "Mast Bar".
 */
export function lookup(index, key) {
  const exact = index.get(key);
  if (exact) return exact;
  if (!key.includes(' ')) return [];
  // Stacked lines can join in another order than the name reads ("BACIO IL SECONDO").
  const sortedWords = (k) => k.split(' ').sort().join(' ');
  const reordered = [...index].filter(([name]) => sortedWords(name) === sortedWords(key));
  if (reordered.length) return reordered.flatMap(([, entries]) => entries);
  const found = [];
  for (const [name, entries] of index) {
    if (name.includes(' ') && (name.startsWith(`${key} `) || key.startsWith(`${name} `)))
      found.push(...entries);
  }
  return found;
}

const packT = (pack, f) => {
  const { minX, maxX } = pack.geometry.extent;
  return (f.center[0] - minX) / (maxX - minX);
};

const packSide = (pack, f) => {
  const beam = pack.geometry.beamMeters ?? pack.geometry.extent.maxY;
  const a = f.center[1] / beam;
  return a < 1 / 3 ? 'port' : a > 2 / 3 ? 'starboard' : 'center';
};

const decksOf = (deckNumber, f) => f.spansDecks ?? [deckNumber];

/**
 * Checks official facts against a published pack.
 *
 * Venue statuses: `match` (deck and zone agree), `zone-mismatch`, `deck-mismatch`, or
 * `not-in-pack` when no pack venue carries that name or alias. `sideAgrees` is reported
 * alongside a match but doesn't decide it: the pack's side is often synthetic.
 */
export function comparePack(facts, pack) {
  const index = packNameIndex(pack);
  const venues = [];
  for (const deck of facts.decks) {
    for (const v of deck.venues) {
      const candidates = lookup(index, normalizeName(v.name));
      if (!candidates.length) {
        venues.push({ ...v, deckNumber: deck.deckNumber, status: 'not-in-pack' });
        continue;
      }
      const sameDeck = candidates.filter((c) =>
        decksOf(c.deckNumber, c.feature).includes(deck.deckNumber)
      );
      if (!sameDeck.length) {
        venues.push({
          ...v,
          deckNumber: deck.deckNumber,
          status: 'deck-mismatch',
          packDecks: [...new Set(candidates.map((c) => c.deckNumber))].sort((a, b) => a - b),
          packId: candidates[0].feature.id,
        });
        continue;
      }
      const agreeing = sameDeck.find((c) => zonesAgree(v.t, zoneOf(packT(pack, c.feature))));
      const best = agreeing ?? sameDeck[0];
      venues.push({
        ...v,
        deckNumber: deck.deckNumber,
        status: agreeing ? 'match' : 'zone-mismatch',
        packId: best.feature.id,
        packZone: zoneOf(packT(pack, best.feature)),
        packConfidence:
          best.feature.positionConfidence ??
          pack.positionConfidenceDefaults?.[best.feature.featureType],
        // Only port against starboard counts as disagreeing: centre-ish labels are ambiguous.
        sideAgrees:
          [v.side, packSide(pack, best.feature)].includes('center') ||
          v.side === packSide(pack, best.feature),
      });
    }
  }

  const cabins = [];
  for (const deck of facts.decks) {
    const packDeck = pack.decks.find((d) => d.deckNumber === deck.deckNumber);
    const packCabins = { port: new Set(), starboard: new Set() };
    for (const f of packDeck?.features ?? []) {
      if (f.featureType !== 'cabin' || !f.cabin) continue;
      packCabins[f.cabin.side === 'port' ? 'port' : 'starboard'].add(Number(f.cabin.number));
    }
    for (const side of ['port', 'starboard']) {
      const official = deck.cabins[side];
      if (!official.length && !packCabins[side].size) continue;
      const officialSet = new Set(official);
      cabins.push({
        deckNumber: deck.deckNumber,
        side,
        official: official.length,
        pack: packCabins[side].size,
        missingFromPack: official.filter((n) => !packCabins[side].has(n)),
        notOnOfficialPlan: [...packCabins[side]]
          .filter((n) => !officialSet.has(n))
          .sort((a, b) => a - b),
      });
    }
  }
  return { venues, cabins };
}

// ------------------------------------------------------------------ report

/** Collapses sorted numbers into "6101–6115, 6119" runs (step 2, as cabins alternate sides). */
export function formatRuns(numbers, step = 2) {
  const runs = [];
  for (const n of numbers) {
    const last = runs[runs.length - 1];
    if (last && n - last[1] === step) last[1] = n;
    else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
}

export function formatReport(shipId, facts, comparison) {
  const lines = [`# Official deck plan check: ${shipId}`, ''];
  lines.push(
    `Read ${facts.decks.length} deck SVGs. Drawing faces bow ${facts.orientation.bow}, port ${facts.orientation.port}.`,
    ''
  );
  const by = (status) => comparison.venues.filter((v) => v.status === status);
  const matches = by('match');
  lines.push(
    `## Venues: ${matches.length} match, ${comparison.venues.length - matches.length} to review`,
    ''
  );
  for (const [status, title] of [
    ['deck-mismatch', 'On a different deck in the pack'],
    ['zone-mismatch', 'In a different fore/aft zone in the pack'],
    ['not-in-pack', 'Not in the pack under this name'],
  ]) {
    const rows = by(status);
    if (!rows.length) continue;
    lines.push(`### ${title} (${rows.length})`, '');
    for (const v of rows) {
      const detail =
        status === 'deck-mismatch'
          ? `official deck ${v.deckNumber}, pack deck ${v.packDecks.join('/')} (${v.packId})`
          : status === 'zone-mismatch'
            ? `deck ${v.deckNumber}: official ${v.zone} (${v.t}), pack ${v.packZone} (${v.packId})`
            : `deck ${v.deckNumber}, ${v.zone}, ${v.side}`;
      lines.push(`- ${v.name}: ${detail}`);
    }
    lines.push('');
  }
  const upgradable = matches.filter((v) => v.packConfidence !== 'verified');
  if (upgradable.length) {
    lines.push(`### Matches not yet marked verified (${upgradable.length})`, '');
    for (const v of upgradable) {
      lines.push(
        `- ${v.name} (${v.packId}): deck ${v.deckNumber} ${v.zone}${v.sideAgrees ? '' : `, official side ${v.side}`}`
      );
    }
    lines.push('');
  }
  lines.push('## Staterooms', '');
  for (const c of comparison.cabins) {
    const ok = !c.missingFromPack.length && !c.notOnOfficialPlan.length;
    let line = `- Deck ${c.deckNumber} ${c.side}: ${c.official} official, ${c.pack} in pack${ok ? ', all match' : ''}`;
    if (c.missingFromPack.length) line += `; missing from pack: ${formatRuns(c.missingFromPack)}`;
    if (c.notOnOfficialPlan.length)
      line += `; not on official plan: ${formatRuns(c.notOnOfficialPlan)}`;
    lines.push(line);
  }
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------------ CLI

/**
 * Reads every deck SVG and turns them into facts for one ship.
 * @param {{ files: { name: string, svg: string }[], bow?: string, port?: string }} input
 */
export function buildFacts({ files, bow, port }) {
  const decks = [];
  for (const { name, svg } of files) {
    const deckNumber = deckNumberFromFilename(name);
    if (deckNumber === null) continue;
    const parsed = parseSvgLabels(svg);
    decks.push({ deckNumber, labels: parsed.labels, viewBox: parsed.viewBox });
  }
  decks.sort((a, b) => a.deckNumber - b.deckNumber);
  if (!decks.length) throw new Error('No deck-<n>.svg files found');
  if (!decks.some((d) => d.labels.length)) {
    throw new Error(
      'No text labels in any SVG. The labels are probably drawn as outlines, which this script cannot read.'
    );
  }
  const calibrated = calibrateOrientation(decks);
  const orientation = { bow: bow ?? calibrated.bow, port: port ?? calibrated.port };
  if (!orientation.bow || !orientation.port) {
    throw new Error(
      'Cannot tell which way the drawings face (too few stateroom numbers). Pass --bow and --port (left, right, top or bottom).'
    );
  }
  if (SIDES[orientation.bow][0] === SIDES[orientation.port][0]) {
    throw new Error('--bow and --port must be on different axes (e.g. --bow top --port right)');
  }
  const frames = hullFrames(decks, SIDES[orientation.bow][0]);
  return {
    orientation,
    decks: decks.map((d) => deckFacts(d, { ...orientation, hull: frames.get(d.deckNumber) })),
  };
}

export function parseArgs(argv) {
  const args = { shipId: 'celebrity-xcel', write: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ship-id') args.shipId = argv[++i];
    else if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--bow') args.bow = argv[++i];
    else if (arg === '--port') args.port = argv[++i];
    else if (arg === '--write') args.write = true;
    else if (arg === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const flag of ['bow', 'port']) {
    if (args[flag] && !(args[flag] in SIDES))
      throw new Error(`--${flag} must be left, right, top or bottom`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir ? resolve(args.dir) : officialDir(args.shipId);
  let names;
  try {
    names = (await readdir(dir)).filter((n) => n.toLowerCase().endsWith('.svg'));
  } catch {
    throw new Error(
      `No folder at ${dir}. Save the ship's deck SVGs from celebritycruises.com there (see docs/research/official_deck_plan_svgs.md).`
    );
  }
  const files = await Promise.all(
    names.map(async (name) => ({ name, svg: await readFile(resolve(dir, name), 'utf8') }))
  );
  const facts = buildFacts({ files, bow: args.bow, port: args.port });
  const pack = JSON.parse(await readFile(packPath(args.shipId), 'utf8'));
  const comparison = comparePack(facts, pack);

  if (args.write) {
    const out = {
      shipId: args.shipId,
      source: 'Celebrity Cruises official deck plan SVGs',
      ...facts,
    };
    await writeFile(factsPath(args.shipId), JSON.stringify(out, null, 2) + '\n');
    console.error(`Wrote ${factsPath(args.shipId)}`);
  }
  process.stdout.write(
    args.json
      ? JSON.stringify(comparison, null, 2) + '\n'
      : formatReport(args.shipId, facts, comparison)
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
