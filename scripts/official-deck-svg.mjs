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
 *   node scripts/official-deck-svg.mjs --ship-id celebrity-xcel --bow right --port bottom
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
 * @param {string} svg
 * @returns {{ viewBox: { minX: number, minY: number, width: number, height: number } | null,
 *             labels: { text: string, x: number, y: number }[] }}
 */
export function parseSvgLabels(svg) {
  const body = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const labels = [];
  const stack = [IDENTITY];
  let viewBox = null;
  let current = null; // the <text> being read: { matrix, x, y, parts }
  const tagRe = /<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let skipDepth = 0; // inside <defs>, <style>, <title> etc. nothing is drawn as a label

  for (const [, closing, rawName, rawAttrs, selfClosing, textNode] of body.matchAll(tagRe)) {
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
          const [x, y] = apply(current.matrix, current.x ?? 0, current.y ?? 0);
          labels.push({ text, x, y });
        }
        current = null;
      }
      if (stack.length > 1) stack.pop();
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

    if (name === 'text') {
      current = { matrix, x: firstNumber(attrs.x), y: firstNumber(attrs.y), parts: [] };
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
  }
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
 * What a label is. Stateroom numbers carry their deck as a prefix (6101, 10122); anything
 * else naming stairs or lifts is circulation; text with letters is a venue or area name.
 */
export function classifyLabel(text, deckNumber) {
  const t = text.trim();
  if (/^\d{4,5}$/.test(t)) return t.startsWith(String(deckNumber)) ? 'cabin' : 'other';
  if (/\b(elevators?|lifts?)\b/i.test(t)) return 'elevator';
  if (/\b(stairs?|stairwell|staircase)\b/i.test(t)) return 'stairs';
  if (!/[a-z]{3,}/i.test(t)) return 'other'; // legend letters, icons, stray digits
  return 'venue';
}

/** Mean of the values, or NaN when there are none. */
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;

/**
 * Works out which way the drawing faces from the stateroom numbers: Celebrity numbers
 * staterooms upward from bow to stern, odd to port and even to starboard. Needs cabins on
 * at least one deck; returns null for a direction it can't tell.
 *
 * @param {{ deckNumber: number, labels: { text: string, x: number, y: number }[] }[]} decks
 * @returns {{ bow: 'left' | 'right' | null, port: 'top' | 'bottom' | null }}
 */
export function calibrateOrientation(decks) {
  let slopeVotes = 0;
  const odd = [];
  const even = [];
  for (const { deckNumber, labels } of decks) {
    const cabins = labels.filter((l) => classifyLabel(l.text, deckNumber) === 'cabin');
    if (cabins.length < 4) continue;
    const xs = cabins.map((c) => c.x);
    const seqs = cabins.map((c) => Number(c.text) % 1000);
    const mx = mean(xs);
    const ms = mean(seqs);
    const cov = xs.reduce((s, x, i) => s + (x - mx) * (seqs[i] - ms), 0);
    slopeVotes += Math.sign(cov);
    for (const c of cabins) (Number(c.text) % 2 ? odd : even).push(c.y);
  }
  return {
    bow: slopeVotes > 0 ? 'left' : slopeVotes < 0 ? 'right' : null,
    port: odd.length && even.length ? (mean(odd) < mean(even) ? 'top' : 'bottom') : null,
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
 * extent; `side` is port / starboard / center by which third of the beam the label sits in.
 *
 * @param {{ deckNumber: number, labels: { text: string, x: number, y: number }[] }} deck
 * @param {{ bow: 'left' | 'right', port: 'top' | 'bottom',
 *           hull: { minX: number, maxX: number, minY: number, maxY: number } }} frame
 */
export function deckFacts({ deckNumber, labels }, { bow, port, hull }) {
  const along = (x) => {
    const f = (x - hull.minX) / (hull.maxX - hull.minX);
    return Math.min(1, Math.max(0, bow === 'left' ? f : 1 - f));
  };
  const across = (y) => {
    const f = (y - hull.minY) / (hull.maxY - hull.minY);
    return port === 'top' ? f : 1 - f; // 0 = port rail, 1 = starboard rail
  };
  const sideOf = (y) => {
    const a = across(y);
    return a < 1 / 3 ? 'port' : a > 2 / 3 ? 'starboard' : 'center';
  };

  const facts = {
    deckNumber,
    venues: [],
    elevators: [],
    stairs: [],
    cabins: { port: [], starboard: [] },
  };
  for (const label of labels) {
    const kind = classifyLabel(label.text, deckNumber);
    if (kind === 'other') continue;
    if (kind === 'cabin') {
      // Side comes from where it's drawn, since a few suites break odd-to-port; parity only
      // settles the stern-facing staterooms drawn near the centreline.
      const a = across(label.y);
      const odd = Number(label.text) % 2 === 1;
      const side = a < 0.4 || (a <= 0.6 && odd) ? 'port' : 'starboard';
      facts.cabins[side].push(Number(label.text));
      continue;
    }
    const t = round2(along(label.x));
    const fact = { name: label.text, t, zone: zoneOf(t), side: sideOf(label.y) };
    if (kind === 'venue') facts.venues.push(fact);
    else facts[kind === 'elevator' ? 'elevators' : 'stairs'].push(fact);
  }
  facts.cabins.port.sort((a, b) => a - b);
  facts.cabins.starboard.sort((a, b) => a - b);
  facts.venues.sort((a, b) => a.t - b.t || a.name.localeCompare(b.name));
  return facts;
}

/**
 * The hull's extent in drawing units. Without an explicit one, the spread of the
 * stateroom and venue labels across all decks stands in for it (padded slightly, since
 * no label sits on the bow tip); the viewBox is the last resort.
 */
export function hullExtent(decks, viewBox) {
  const pts = decks.flatMap(({ deckNumber, labels }) =>
    labels.filter((l) => classifyLabel(l.text, deckNumber) !== 'other')
  );
  if (pts.length >= 8) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [minX, maxX, minY, maxY] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ];
    const padX = (maxX - minX) * 0.03;
    const padY = (maxY - minY) * 0.08;
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
  }
  if (viewBox) {
    return {
      minX: viewBox.minX,
      maxX: viewBox.minX + viewBox.width,
      minY: viewBox.minY,
      maxY: viewBox.minY + viewBox.height,
    };
  }
  throw new Error('Cannot tell the hull extent: no labels and no viewBox');
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
 * Pack venues for an official name: an exact name or alias first, else ones whose name
 * extends it or that it extends word by word ("Mast Grill" ↔ "Mast Grill & Bar"). A
 * one-word name only matches exactly, so "Mast" never pulls in "Mast Bar".
 */
export function lookup(index, key) {
  const exact = index.get(key);
  if (exact) return exact;
  if (!key.includes(' ')) return [];
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
 * Reads every deck SVG in `dir` and turns them into facts for one ship.
 * @param {{ files: { name: string, svg: string }[], bow?: 'left' | 'right', port?: 'top' | 'bottom' }} input
 */
export function buildFacts({ files, bow, port }) {
  const decks = [];
  let viewBox = null;
  for (const { name, svg } of files) {
    const deckNumber = deckNumberFromFilename(name);
    if (deckNumber === null) continue;
    const parsed = parseSvgLabels(svg);
    viewBox ??= parsed.viewBox;
    decks.push({ deckNumber, labels: parsed.labels });
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
      'Cannot tell which way the drawings face (too few stateroom numbers). Pass --bow left|right and --port top|bottom.'
    );
  }
  const hull = hullExtent(decks, viewBox);
  return {
    orientation,
    decks: decks.map((d) => deckFacts(d, { ...orientation, hull })),
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
  if (args.bow && !['left', 'right'].includes(args.bow))
    throw new Error('--bow must be left or right');
  if (args.port && !['top', 'bottom'].includes(args.port))
    throw new Error('--port must be top or bottom');
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
