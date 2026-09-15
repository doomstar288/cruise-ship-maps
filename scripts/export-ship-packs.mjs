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

import {
  CELEBRITY_XCEL_METADATA,
  CELEBRITY_XCEL_DECKS,
} from '../src/data/celebrityXcelData.js';

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
    featureType,
    category: venue.category,
    description: venue.description,
    bounds: bounds.length >= 2 ? [bounds[0], bounds[1]] : [center, center],
    center: center ?? [
      round((bounds[0][0] + bounds[1][0]) / 2),
      round((bounds[0][1] + bounds[1][1]) / 2),
    ],
    tags: venue.tags?.length ? venue.tags : undefined,
    color: venue.color,
  };
  if (featureType === 'cabin') feature.cabin = cabinMetaFor(venue);
  return feature;
}

function toDeck(deck) {
  const features = (deck.venues ?? []).map(toFeature).filter(Boolean);
  const outline = (deck.shapeCoordinates ?? []).filter(isPoint).map(roundPoint);
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
  const { specVersion, shipId, geometry, decks } = pack;
  const canonical = JSON.stringify({ specVersion, shipId, geometry, decks });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

/** Build one ship's pack from its in-app metadata + deck records. */
export function buildPack(metadata, decks) {
  const geometry = {
    units: 'plan-units',
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
    decks: decks.map(toDeck).sort((a, b) => a.deckNumber - b.deckNumber),
  };

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

/** Every ship this repo can currently publish. */
export const SHIPS = [{ metadata: CELEBRITY_XCEL_METADATA, decks: CELEBRITY_XCEL_DECKS }];

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
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const packs = await Promise.all(
    SHIPS.map(async ({ metadata, decks }) => {
      const pack = buildPack(metadata, decks);
      const previous = await readJsonIfExists(
        resolve(args.out, `v1/ships/${pack.shipId}/plan.json`)
      );
      return reconcilePackTimestamp(pack, previous);
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
    const bytes = Buffer.byteLength(serialize(pack, args.pretty));
    console.log(
      `  ${pack.shipName}: ${pack.decks.length} decks, ${features} features, ` +
        `${(bytes / 1024).toFixed(0)} KB, rev ${pack.revision}`
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
