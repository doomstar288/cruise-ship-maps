#!/usr/bin/env node
/**
 * Ship Map Pack v1 exporter.
 *
 * Publishes the in-app deck data as static, versioned JSON that external trip
 * planners can consume without running this app or standing up the REST API.
 * AuraTrip is the first consumer; see its docs/SHIP_MAP_SERVICE_INTERFACE.md for
 * the contract these files implement.
 *
 * Why static files rather than the OpenAPI service in
 * docs/architecture/system_architecture_and_scaling.md: the paths below mirror
 * the REST routes exactly (`/v1/ships/index.json` ↔ `GET /v1/ships`), so a client
 * written against these can be repointed at the live API by swapping a base URL.
 * Static also means offline-capable consumers and no API key — the constraint
 * that killed every commercial deck-plan source AuraTrip evaluated.
 *
 * The geometry here is SYNTHETIC: a programmatic CAD grid, not a traced copy of
 * any cruise line's copyrighted deck plan. That is what makes it MIT-licensable
 * and legal for consumers to cache and redistribute — the attribution string
 * emitted in every pack says so, and must not be dropped downstream.
 *
 * Usage:
 *   node scripts/export-ship-packs.mjs [--out DIR] [--dry-run] [--pretty]
 *
 * No dependencies: Node 20+ only.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import {
  CELEBRITY_XCEL_METADATA,
  CELEBRITY_XCEL_DECKS,
} from '../src/data/celebrityXcelData.js';
import { generateShip } from '../src/utils/shipGenerator.js';
import { withEntrances } from './venue-entrances.mjs';
import { buildRouting, getShipRoutingConnectors } from './routing-graph.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUT = resolve(REPO_ROOT, 'public');

export const SPEC_VERSION = 1;

const LICENSE = 'MIT';
const SOURCE_URL = 'https://github.com/doomstar288/cruise-ship-maps';
/** Shown under the rendered map by consumers. Honesty about provenance is the
 *  point: this is a navigational aid, not the ship's official plan. */
const ATTRIBUTION = 'Cruise Ship Maps — synthetic layout, not an official deck plan';

// --------------------------------------------------------------- classification

/** Tag/category signals that a "venue" is really vertical circulation. */
const ELEVATOR_PATTERN = /\b(elevator|lift)\b/i;
const STAIR_PATTERN = /\b(stair|stairwell|stairs)\b/i;
const MUSTER_PATTERN = /\b(muster|assembly station|lifeboat)\b/i;
const CABIN_CATEGORY = /^(staterooms?|suites?)$/i;
/** Crew and back-of-house space: category "Crew & Service", or a name like
 *  "Crew & Technical Areas" / "Provision Stores". Tags are deliberately not read:
 *  the Navigation Bridge is also tagged "Crew Only" but is a named landmark. */
const CREW_PATTERN = /\b(crew|technical areas?|provision stores?|back[- ]of[- ]house)\b/i;

/** Whether a record is decorative or crew-only rather than somewhere a guest goes. */
export function isNonGuestSpace(venue) {
  if (venue.hideLabel) return true;
  return CREW_PATTERN.test(`${venue.category ?? ''} ${venue.name ?? ''}`);
}

/**
 * Structural kind for a venue record, using the Cruise Deck GeoJSON Extension
 * v1.0 `feature_type` vocabulary this platform already publishes.
 *
 * The in-app data models everything as a "venue" with a free-form category, so
 * the kind has to be inferred from category, name and tags. Elevator banks are
 * checked before stairs because the shared cores are tagged with both and a
 * consumer's wayfinding cares more about the lift.
 */
export function classifyFeature(venue) {
  const haystack = `${venue.name ?? ''} ${(venue.tags ?? []).join(' ')}`;
  if (ELEVATOR_PATTERN.test(haystack)) return 'elevator';
  if (STAIR_PATTERN.test(haystack)) return 'stairwell';
  if (MUSTER_PATTERN.test(haystack)) return 'muster_station';
  if (CABIN_CATEGORY.test(venue.category ?? '')) return 'cabin';
  // Crew strips and back-of-house blocks are emitted as `corridor`, not dropped:
  // consumers (AuraTrip) still draw corridors as circulation, so the deck keeps
  // its real footprint, but only venue/poi/muster_station are listed in search.
  // Never use `poi` or `muster_station` here: consumers list both.
  if (isNonGuestSpace(venue)) return 'corridor';
  return 'venue';
}

/** Leading run of 3+ digits in a cabin name: "Stateroom 10101 (…)" → "10101". */
const cabinNumberFrom = (name) => (String(name ?? '').match(/\d{3,}/) ?? [null])[0];

/** Cabin detail for a venue. `type` is always inferable, so this always returns
 *  an object; undefined-valued keys drop out at JSON serialization. */
export function cabinMetaFor(venue) {
  const number = cabinNumberFrom(venue.name);
  const side = venue.side ? String(venue.side).toLowerCase() : undefined;
  const meta = {
    number: number ?? undefined,
    type: venue.category === 'Suites' ? 'suite' : 'stateroom',
    side: side === 'port' || side === 'starboard' ? side : undefined,
    accessible: typeof venue.ada === 'boolean' ? venue.ada : undefined,
    sqft: Number.isFinite(venue.sqft) ? venue.sqft : undefined,
    verandaSqft: Number.isFinite(venue.verandaSqft) ? venue.verandaSqft : undefined,
    connecting: venue.connecting ?? undefined,
  };
  return Object.values(meta).some((v) => v !== undefined) ? meta : undefined;
}

// ------------------------------------------------------------- names and spans

/** Feature types a consumer lists in guest search, and so the only ones that get aliases. */
const ALIASABLE_TYPES = new Set(['venue', 'poi']);

/** Case-, accent- and spacing-insensitive form of a name: "Café" and "cafe" match. */
export function foldName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Alternate names for a feature, as authored on its deck record. Order is kept;
 * repeats and an alias that restates the feature's own name are dropped, so a
 * multi-deck venue can hand every level the same list. Accents are compared, not
 * folded, here: "Oceanview Cafe" is the point of an alias for "Oceanview Café",
 * since not every consumer folds accents. Returns undefined when nothing is
 * left, so the pack omits the key rather than emitting `[]`.
 */
export function featureAliasesFor(venue, featureType) {
  const authored = (venue.aliases ?? []).map((a) => String(a).trim()).filter(Boolean);
  if (!authored.length) return undefined;
  if (!ALIASABLE_TYPES.has(featureType)) {
    // Loud, not silent: an alias on crew space or a cabin is a data mistake.
    throw new Error(`${venue.id} is a ${featureType}; only venue and poi features take aliases`);
  }
  const exactKey = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const seen = new Set([exactKey(venue.name)]);
  const aliases = authored.filter((alias) => {
    const key = exactKey(alias);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return aliases.length ? aliases : undefined;
}

/** Every deck a multi-deck venue occupies, ascending and deduplicated; undefined if none. */
export function spansDecksFor(venue) {
  const decks = [...new Set((venue.spansDecks ?? []).filter(Number.isInteger))].sort((a, b) => a - b);
  return decks.length ? decks : undefined;
}

// ---------------------------------------------------------------------- access

/**
 * Who may use a venue, when not every guest may:
 * - `suite`: suite guests only (The Retreat, Luminae). Compare with `cabin.type`.
 * - `adults`: adults only (the Solarium).
 * - `kids`: the youth programme's clubs, for children and teens only.
 * - `paid`: open to anyone who buys a pass or books it (thermal suites, cabanas).
 * Public venues omit the field.
 */
export const ACCESS = ['suite', 'adults', 'kids', 'paid'];

/** The values that keep other guests out, not just charge them. A route to a
 *  venue without the same value must never pass through one of these. */
export const ACCESS_BARS_ENTRY = new Set(['suite', 'adults', 'kids']);

/** A record's `access`, validated; undefined for a public venue. */
export function accessFor(venue, featureType) {
  const authored = venue.access;
  if (authored === undefined) return undefined;
  if (!ACCESS.includes(authored)) {
    throw new Error(`Venue ${venue.id} has unknown access "${authored}"`);
  }
  if (!ALIASABLE_TYPES.has(featureType)) {
    throw new Error(`${venue.id} is a ${featureType}; only venue and poi features take access`);
  }
  return authored;
}

// ------------------------------------------------------------------ port exits

/**
 * Where guests leave the ship in port:
 * - `gangway`: the gangway, when the ship is alongside.
 * - `tender`: where guests step onto the tenders, when it is at anchor.
 * Only on the exit itself, never on the lounge or desk beside it (Destination
 * Gateway, where guests wait for tenders; Shore Excursions).
 */
export const PORT_EXITS = ['gangway', 'tender'];

/** A record's `portExit`, validated; undefined for anything that isn't an exit. */
export function portExitFor(venue, featureType) {
  const authored = venue.portExit;
  if (authored === undefined) return undefined;
  if (!PORT_EXITS.includes(authored)) {
    throw new Error(`Venue ${venue.id} has unknown portExit "${authored}"`);
  }
  if (!ALIASABLE_TYPES.has(featureType)) {
    throw new Error(`${venue.id} is a ${featureType}; only venue and poi features take portExit`);
  }
  return authored;
}

// ------------------------------------------------------ hours and booking facts
//
// Typical facts for planning a visit: when a venue is usually open, whether it's
// booked ahead, what the food costs and the usual dress code. The day's printed
// program always wins over them.

/** What food costs a guest who may use the venue (`access` says who may):
 *  in the fare, a cover charge per person, or priced per item. */
export const FEES = ['included', 'surcharge', 'a la carte'];

/** A venue's usual dress code. The program's attire for the evening wins. */
export const DRESS_CODES = ['casual', 'smart casual'];

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MINUTES = 24 * 60;
const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/**
 * A record's typical opening windows, validated; undefined when it has none.
 *
 * `[[open, close], …]` in ship's time, 24-hour "HH:MM", in opening order. A window
 * whose close is earlier than its open runs past midnight (`["21:00", "02:00"]`);
 * only the last window may, and it must close before the first one opens. Midnight
 * as a close is "24:00", never "00:00", and `[["00:00", "24:00"]]` is open all day.
 * Windows never overlap or touch: touching windows are one window.
 */
export function hoursFor(venue, featureType) {
  const authored = venue.hours;
  if (authored === undefined) return undefined;
  if (!ALIASABLE_TYPES.has(featureType)) {
    throw new Error(`${venue.id} is a ${featureType}; only venue and poi features take hours`);
  }
  const reject = (why) => {
    throw new Error(`Venue ${venue.id} has malformed hours: ${why}`);
  };
  if (!Array.isArray(authored) || authored.length === 0) reject('expected a list of [open, close] windows');
  if (authored.length === 1 && authored[0]?.[0] === '00:00' && authored[0]?.[1] === '24:00') {
    return [['00:00', '24:00']];
  }

  let previousClose = -1;
  authored.forEach((window, i) => {
    if (!Array.isArray(window) || window.length !== 2) reject(`window ${i + 1} is not an [open, close] pair`);
    const [open, close] = window;
    if (typeof open !== 'string' || !CLOCK.test(open)) reject(`"${open}" is not an HH:MM opening time`);
    if (typeof close !== 'string' || !(CLOCK.test(close) || close === '24:00')) {
      reject(`"${close}" is not an HH:MM closing time`);
    }
    if (close === '00:00') reject('write a close at midnight as "24:00"');
    const start = minutesOf(open);
    let end = minutesOf(close);
    if (end === start) reject(`window ${i + 1} opens and closes at ${open}`);
    if (end < start) {
      if (i !== authored.length - 1) reject('only the last window may run past midnight');
      end += DAY_MINUTES;
    }
    if (start <= previousClose) reject('windows must be in opening order and must not overlap or touch');
    previousClose = end;
  });
  if (previousClose >= minutesOf(authored[0][0]) + DAY_MINUTES) {
    reject('the last window runs into the first one the next day');
  }
  return authored.map(([open, close]) => [open, close]);
}

/** A record's `reservationRequired`, `fee` and `dressCode`, validated. Only the
 *  facts it authors come back, so the pack omits the rest. */
export function bookingFactsFor(venue, featureType) {
  const facts = {};
  const { reservationRequired, fee, dressCode } = venue;
  if (reservationRequired !== undefined) {
    if (typeof reservationRequired !== 'boolean') {
      throw new Error(`Venue ${venue.id} has reservationRequired "${reservationRequired}"; expected true or false`);
    }
    facts.reservationRequired = reservationRequired;
  }
  if (fee !== undefined) {
    if (!FEES.includes(fee)) throw new Error(`Venue ${venue.id} has unknown fee "${fee}"`);
    facts.fee = fee;
  }
  if (dressCode !== undefined) {
    if (!DRESS_CODES.includes(dressCode)) throw new Error(`Venue ${venue.id} has unknown dressCode "${dressCode}"`);
    facts.dressCode = dressCode;
  }
  if (Object.keys(facts).length && !ALIASABLE_TYPES.has(featureType)) {
    throw new Error(`${venue.id} is a ${featureType}; only venue and poi features take booking facts`);
  }
  return facts;
}

// --------------------------------------------------------- position confidence

/**
 * How far a consumer can trust where a feature is drawn, weakest last:
 * - `verified`: deck, fore/aft zone and side checked against an authoritative plan.
 * - `zone`: deck and fore/aft zone are reliable; exact spot and side are not.
 * - `estimated`: deck or zone is uncertain or conflicting, or the geometry is synthetic.
 */
export const POSITION_CONFIDENCE = ['verified', 'zone', 'estimated'];

/** What a feature gets when its source record sets no `positionConfidence`.
 *  Corridors are absent on purpose: they are circulation, never a destination. */
const DEFAULT_POSITION_CONFIDENCE = {
  venue: 'zone',
  poi: 'zone',
  muster_station: 'zone',
  elevator: 'estimated',
  stairwell: 'estimated',
  cabin: 'estimated',
};

/**
 * Per-type defaults published once at pack level instead of on every feature.
 * Cabins are ~1,700 of the ~1,800 features, so stamping each one would add
 * ~50 KB raw for a value that is the same everywhere. A consumer resolves a
 * feature's confidence as `feature.positionConfidence ??
 * pack.positionConfidenceDefaults[feature.featureType]`, and treats a result that
 * is still undefined as "no confidence claim" (only corridors, today).
 */
export const PACK_POSITION_CONFIDENCE_DEFAULTS = { cabin: 'estimated' };

/** A record's confidence: its own authored fact, else the default for its type. */
export function positionConfidenceFor(venue, featureType) {
  if (featureType === 'corridor') return undefined;
  const authored = venue.positionConfidence;
  if (authored === undefined) return DEFAULT_POSITION_CONFIDENCE[featureType];
  if (!POSITION_CONFIDENCE.includes(authored)) {
    throw new Error(`Venue ${venue.id} has unknown positionConfidence "${authored}"`);
  }
  return authored;
}

// -------------------------------------------------------------------- geometry

/** Plan coordinates carry ~1 cm of meaning; 2 dp keeps files small losslessly. */
const round = (n) => Math.round(n * 100) / 100;
const roundPoint = (p) => [round(p[0]), round(p[1])];

const isPoint = (p) =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * The bounding box shared by EVERY deck of a ship.
 *
 * This is pack-level, not per-deck, on purpose: consumers normalize coordinates
 * against it, so a per-deck extent would stretch the narrow sun deck to the same
 * width as the widest deck and silently misplace every venue on it.
 */
export function computeExtent(decks) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (p) => {
    if (!isPoint(p)) return;
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  };

  for (const deck of decks) {
    for (const p of deck.shapeCoordinates ?? []) include(p);
    for (const venue of deck.venues ?? []) {
      for (const p of venue.bounds ?? []) include(p);
      include(venue.center);
    }
  }

  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
    throw new Error('Deck data produced an empty or degenerate extent');
  }
  return { minX: round(minX), minY: round(minY), maxX: round(maxX), maxY: round(maxY) };
}

// -------------------------------------------------------------------- assembly

function toFeature(venue) {
  const featureType = classifyFeature(venue);
  const bounds = (venue.bounds ?? []).filter(isPoint).map(roundPoint);
  const center = isPoint(venue.center) ? roundPoint(venue.center) : null;
  if (bounds.length < 2 && !center) return null;

  const feature = {
    id: venue.id,
    name: venue.name,
    aliases: featureAliasesFor(venue, featureType),
    featureType,
    spansDecks: spansDecksFor(venue),
    category: venue.category,
    description: venue.description,
    bounds: bounds.length >= 2 ? [bounds[0], bounds[1]] : [center, center],
    center: center ?? [
      round((bounds[0][0] + bounds[1][0]) / 2),
      round((bounds[0][1] + bounds[1][1]) / 2),
    ],
    tags: venue.tags?.length ? venue.tags : undefined,
    access: accessFor(venue, featureType),
    portExit: portExitFor(venue, featureType),
    hours: hoursFor(venue, featureType),
    ...bookingFactsFor(venue, featureType),
    color: venue.color,
  };
  const confidence = positionConfidenceFor(venue, featureType);
  if (confidence !== PACK_POSITION_CONFIDENCE_DEFAULTS[featureType]) {
    feature.positionConfidence = confidence;
  }
  if (featureType === 'cabin') feature.cabin = cabinMetaFor(venue);
  return feature;
}

function toDeck(deck) {
  const outline = (deck.shapeCoordinates ?? []).filter(isPoint).map(roundPoint);
  // Large venues get `entrances` on their corridor-facing edges (P1.4).
  const features = withEntrances((deck.venues ?? []).map(toFeature).filter(Boolean), outline);
  return {
    deckNumber: deck.level,
    deckName: deck.name,
    shortName: deck.shortName,
    description: deck.description,
    outline: outline.length >= 3 ? outline : undefined,
    features,
  };
}

/**
 * Short names a consumer might match on. Cruise events are titled "Xcel — Embark"
 * far more often than with the full marketed name, so the line-stripped form has
 * to be discoverable or half the matches miss.
 */
export function aliasesFor(shipName, cruiseLine) {
  const aliases = new Set();
  const linePrefix = String(cruiseLine ?? '').split(/\s+/)[0];
  if (linePrefix && shipName.toLowerCase().startsWith(`${linePrefix.toLowerCase()} `)) {
    aliases.add(shipName.slice(linePrefix.length + 1));
  }
  aliases.delete(shipName);
  return [...aliases];
}

/**
 * Content token for change detection. Hashes only the payload a consumer renders
 * — not `updatedAt` — so re-running the exporter without editing deck data keeps
 * the revision stable and every cached client skips the re-download.
 */
export function revisionOf(pack) {
  const { specVersion, shipId, geometry, positionConfidenceDefaults, decks, routing } = pack;
  const canonical = JSON.stringify({ specVersion, shipId, geometry, positionConfidenceDefaults, decks, routing });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

/** Build one ship's pack from its in-app metadata + deck records. */
export function buildPack(metadata, decks) {
  const geometry = {
    // The deck grid is drawn to real proportions (1 unit = 1 m). Consumers still
    // normalize against `extent`; `units` only tells them distances are metres.
    units: 'meters',
    // The deck grid runs bow (x=0) to stern (x=length), port (y=0) to starboard.
    orientation: 'horizontal',
    extent: computeExtent(decks),
    lengthMeters: metadata.lengthMeters,
    beamMeters: metadata.beamMeters,
  };

  const pack = {
    specVersion: SPEC_VERSION,
    shipId: metadata.id,
    shipName: metadata.name,
    cruiseLine: metadata.cruiseLine,
    imoNumber: metadata.imoNumber,
    license: LICENSE,
    attribution: ATTRIBUTION,
    sourceUrl: SOURCE_URL,
    geometry,
    positionConfidenceDefaults: PACK_POSITION_CONFIDENCE_DEFAULTS,
    decks: decks.map(toDeck).sort((a, b) => a.deckNumber - b.deckNumber),
  };
  // Walk/lift/stairs graph derived from the exported decks (P2.1).
  const connectors = getShipRoutingConnectors({
    shipId: metadata.id,
    lengthMeters: metadata.lengthMeters,
    decks: pack.decks,
  });
  pack.routing = buildRouting(pack.decks, { connectors });

  return { ...pack, revision: revisionOf(pack), updatedAt: new Date().toISOString() };
}

/**
 * Carries the previous `updatedAt` forward when the content revision is
 * unchanged.
 *
 * `buildPack` stamps a fresh timestamp on every run, and `prebuild` re-exports
 * on every build, so without this the committed packs churn a 188 KB diff each
 * time anyone runs `npm run build`. Reusing the timestamp makes the output
 * byte-stable and gives `updatedAt` a more useful meaning: when the deck data
 * last actually changed, not when the exporter last ran.
 */
export function reconcilePackTimestamp(pack, previous) {
  const unchanged = previous?.revision === pack.revision && Boolean(previous?.updatedAt);
  return unchanged ? { ...pack, updatedAt: previous.updatedAt } : pack;
}

/** Same idea for the catalog, which stamps `generatedAt`. */
export function reconcileIndexTimestamp(index, previous) {
  if (!previous?.generatedAt) return index;
  const strip = ({ generatedAt: _ignored, ...rest }) => JSON.stringify(rest);
  return strip(index) === strip(previous)
    ? { ...index, generatedAt: previous.generatedAt }
    : index;
}

/** The catalog row for a built pack. Small by design — it is fetched eagerly. */
export function indexEntryFor(pack) {
  return {
    shipId: pack.shipId,
    shipName: pack.shipName,
    cruiseLine: pack.cruiseLine,
    imoNumber: pack.imoNumber,
    aliases: aliasesFor(pack.shipName, pack.cruiseLine),
    deckCount: pack.decks.length,
    revision: pack.revision,
    updatedAt: pack.updatedAt,
    path: `v1/ships/${pack.shipId}/plan.json`,
  };
}

export const SHIP_IDS = [
  // Edge Series
  'celebrity-xcel',
  'celebrity-ascent',
  'celebrity-beyond',
  'celebrity-apex',
  'celebrity-edge',

  // Solstice Class
  'celebrity-solstice',
  'celebrity-equinox',
  'celebrity-eclipse',
  'celebrity-silhouette',
  'celebrity-reflection',

  // Millennium Class
  'celebrity-millennium',
  'celebrity-infinity',
  'celebrity-summit',
  'celebrity-constellation',
];

/** Every ship this repo can currently publish. */
export const SHIPS = SHIP_IDS.map((shipId) => {
  if (shipId === 'celebrity-xcel') {
    return { metadata: CELEBRITY_XCEL_METADATA, decks: CELEBRITY_XCEL_DECKS };
  }
  const { metadata, decks } = generateShip(shipId);
  return { metadata, decks };
});

// ------------------------------------------------------------------------ main

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, dryRun: false, pretty: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = resolve(process.cwd(), argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--pretty') args.pretty = true;
  }
  return args;
}

const serialize = (value, pretty) => JSON.stringify(value, null, pretty ? 2 : 0);

async function writeJson(path, value, pretty) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${serialize(value, pretty)}\n`, 'utf8');
}

/** Previously published JSON at `path`, or null on a first run. */
async function readJsonIfExists(path) {
  const text = await readTextIfExists(path);
  return text === null ? null : JSON.parse(text);
}

async function readTextIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** "619 KB raw / 58 KB gzipped" for a file's text. */
export function sizeSummary(text) {
  const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
  return `${kb(Buffer.byteLength(text))} raw / ${kb(gzipSync(text).length)} gzipped`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const previousText = new Map();
  const packs = await Promise.all(
    SHIPS.map(async ({ metadata, decks }) => {
      const pack = buildPack(metadata, decks);
      const text = await readTextIfExists(resolve(args.out, `v1/ships/${pack.shipId}/plan.json`));
      previousText.set(pack.shipId, text);
      return reconcilePackTimestamp(pack, text === null ? null : JSON.parse(text));
    })
  );

  const index = reconcileIndexTimestamp(
    {
      specVersion: SPEC_VERSION,
      generatedAt: new Date().toISOString(),
      license: LICENSE,
      attribution: ATTRIBUTION,
      ships: packs.map(indexEntryFor),
    },
    await readJsonIfExists(resolve(args.out, 'v1/ships/index.json'))
  );

  for (const pack of packs) {
    const features = pack.decks.reduce((n, d) => n + d.features.length, 0);
    const before = previousText.get(pack.shipId);
    const after = sizeSummary(`${serialize(pack, args.pretty)}\n`);
    console.log(
      `  ${pack.shipName}: ${pack.decks.length} decks, ${features} features, ` +
        `${before === null ? 'new' : sizeSummary(before)} → ${after}, rev ${pack.revision}`
    );
  }

  if (args.dryRun) {
    console.log('Dry run — nothing written.');
    return;
  }

  await writeJson(resolve(args.out, 'v1/ships/index.json'), index, args.pretty);
  for (const pack of packs) {
    await writeJson(resolve(args.out, `v1/ships/${pack.shipId}/plan.json`), pack, args.pretty);
  }
  console.log(`Wrote ${packs.length + 1} files to ${args.out}/v1/ships/`);
}

// Only run when invoked directly, so the builders above stay importable by tests.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
