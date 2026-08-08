#!/usr/bin/env node
/**
 * Wikidata fleet seeder.
 *
 * Builds the cruise-ship fleet registry (vessel identity + specs + ship class)
 * from Wikidata, which is CC0 licensed and community-maintained, so new ships
 * appear without us scraping any cruise line.
 *
 * Deck geometry is NOT sourced here — this establishes *which ships exist* and
 * their canonical identifiers, so deck plans can be attached per vessel later.
 *
 * Usage:
 *   node scripts/seed-fleet.mjs [--limit N] [--out PATH] [--dry-run]
 *
 * No dependencies: uses Node 20+ global fetch.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isValidImo, normalizeImo } from '../src/utils/imo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
// Wikidata asks for a descriptive User-Agent identifying the client.
const USER_AGENT =
  'cruise-ship-maps-fleet-seeder/1.0 (https://github.com/doomstar288/cruise-ship-maps)';

const DEFAULT_OUT = resolve(REPO_ROOT, 'public/data/fleet-registry.json');

/**
 * A vessel qualifies three ways, because Wikidata typing is inconsistent:
 *   1. it is (a subclass of) a cruise ship,
 *   2. its vessel class is a cruise-ship class, or
 *   3. its operator is a cruise line.
 * Celebrity Xcel, for example, is typed only as a generic "ship" (Q11446) and
 * is reachable solely via its operator, so rule 3 is not optional.
 *
 * Labels fall back to "mul" (multilingual) because Wikidata migrated many
 * proper nouns — including most ship names — out of per-language labels.
 */
const QUERY = `
SELECT ?ship ?shipLabel ?imo
       (SAMPLE(?mmsi)          AS ?mmsiV)
       (SAMPLE(?operatorLabel) AS ?operatorV)
       (SAMPLE(?operator)      AS ?operatorId)
       (SAMPLE(?classLabel)    AS ?classV)
       (SAMPLE(?class)         AS ?classId)
       (SAMPLE(?builderLabel)  AS ?builderV)
       (MAX(?tonnage)          AS ?gt)
       (MAX(?length)           AS ?loa)
       (MAX(?beam)             AS ?beamV)
       (MIN(?inService)        AS ?entered)
       (MAX(?capacity)         AS ?maxCapacity)
WHERE {
  ?ship wdt:P458 ?imo .
  {   ?ship wdt:P31/wdt:P279* wd:Q39804 }
  UNION
  {   ?ship wdt:P289 ?cCls . ?cCls wdt:P279* wd:Q39804 }
  UNION
  {   ?ship wdt:P137 ?cOp .  ?cOp wdt:P31/wdt:P279* wd:Q946499 }

  OPTIONAL { ?ship wdt:P587 ?mmsi }
  OPTIONAL {
    ?ship wdt:P137 ?operator .
    ?operator rdfs:label ?operatorLabel .
    FILTER(LANG(?operatorLabel) IN ("en","mul"))
  }
  OPTIONAL {
    ?ship wdt:P289 ?class .
    ?class rdfs:label ?classLabel .
    FILTER(LANG(?classLabel) IN ("en","mul"))
  }
  OPTIONAL {
    ?ship wdt:P176 ?builder .
    ?builder rdfs:label ?builderLabel .
    FILTER(LANG(?builderLabel) IN ("en","mul"))
  }
  OPTIONAL { ?ship wdt:P1093 ?tonnage }
  OPTIONAL { ?ship wdt:P2043 ?length }
  OPTIONAL { ?ship wdt:P2261 ?beam }
  OPTIONAL { ?ship wdt:P729 ?inService }
  OPTIONAL { ?ship wdt:P1083 ?capacity }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
GROUP BY ?ship ?shipLabel ?imo
ORDER BY DESC(?gt)
`;

function parseArgs(argv) {
  const args = { limit: null, out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--out') args.out = resolve(process.cwd(), argv[++i]);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/seed-fleet.mjs [--limit N] [--out PATH] [--dry-run]');
      process.exit(0);
    }
  }
  return args;
}

/** POSTs the query, retrying on transient failures with exponential backoff. */
async function runQuery(query, { attempts = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(SPARQL_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(180_000),
      });

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Wikidata responded ${response.status} ${response.statusText}`);
      }
      if (!response.ok) {
        // 4xx other than rate limiting means a bad query — retrying won't help.
        const body = await response.text();
        throw Object.assign(
          new Error(`Query rejected (${response.status}): ${body.slice(0, 400)}`),
          { fatal: true }
        );
      }
      return await response.json();
    } catch (error) {
      if (error.fatal) throw error;
      lastError = error;
      if (attempt < attempts) {
        const delay = 2 ** attempt * 1000;
        console.warn(`  attempt ${attempt} failed (${error.message}); retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`Wikidata query failed after ${attempts} attempts: ${lastError?.message}`);
}

const value = (binding, key) => binding[key]?.value ?? null;

function numeric(binding, key) {
  const raw = value(binding, key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Wikidata dates are ISO timestamps; we only trust the year. */
function year(binding, key) {
  const raw = value(binding, key);
  if (!raw) return null;
  const y = Number(raw.slice(0, 4));
  return Number.isFinite(y) && y > 1800 && y < 2100 ? y : null;
}

const qid = (uri) => (uri ? uri.replace(/^.*\/entity\//, '') : null);

/** Wikidata falls back to the Q-id when an entity has no usable label. */
const isPlaceholderLabel = (label) => !label || /^Q\d+$/.test(label);

function normalizeRow(binding) {
  const imo = normalizeImo(value(binding, 'imo'));
  const name = value(binding, 'shipLabel');
  const wikidataId = qid(value(binding, 'ship'));

  return {
    wikidataId,
    imo,
    imoValid: isValidImo(imo),
    mmsi: value(binding, 'mmsiV'),
    name: isPlaceholderLabel(name) ? null : name,
    operator: value(binding, 'operatorV'),
    operatorId: qid(value(binding, 'operatorId')),
    shipClass: value(binding, 'classV'),
    shipClassId: qid(value(binding, 'classId')),
    builder: value(binding, 'builderV'),
    grossTonnage: numeric(binding, 'gt'),
    lengthMeters: numeric(binding, 'loa'),
    beamMeters: numeric(binding, 'beamV'),
    inServiceYear: year(binding, 'entered'),
    maxCapacity: numeric(binding, 'maxCapacity'),
  };
}

/** Prefers the record with more populated fields when an IMO repeats. */
function completeness(ship) {
  return Object.values(ship).filter((v) => v !== null && v !== false).length;
}

function dedupeByImo(ships) {
  const byImo = new Map();
  for (const ship of ships) {
    const existing = byImo.get(ship.imo);
    if (!existing || completeness(ship) > completeness(existing)) {
      byImo.set(ship.imo, ship);
    }
  }
  return [...byImo.values()];
}

/**
 * Groups vessels by ship class. Sister ships share ~90% of their deck layout,
 * so this index is what makes "digitize one ship, derive the class" possible.
 */
function buildClassIndex(ships) {
  const classes = new Map();
  for (const ship of ships) {
    if (!ship.shipClassId) continue;
    if (!classes.has(ship.shipClassId)) {
      classes.set(ship.shipClassId, {
        id: ship.shipClassId,
        name: ship.shipClass,
        operator: ship.operator,
        imos: [],
      });
    }
    classes.get(ship.shipClassId).imos.push(ship.imo);
  }
  return [...classes.values()]
    .map((c) => ({ ...c, imos: c.imos.sort(), shipCount: c.imos.length }))
    .sort((a, b) => b.shipCount - a.shipCount || String(a.name).localeCompare(String(b.name)));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = args.limit ? `${QUERY}\nLIMIT ${args.limit}` : QUERY;

  console.log('Querying Wikidata for cruise vessels...');
  const started = Date.now();
  const raw = await runQuery(query);
  const bindings = raw.results.bindings;
  console.log(`  ${bindings.length} rows in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const normalized = bindings.map(normalizeRow).filter((s) => s.imo);
  const ships = dedupeByImo(normalized).sort(
    (a, b) => (b.grossTonnage ?? 0) - (a.grossTonnage ?? 0)
  );
  const classes = buildClassIndex(ships);

  const invalidImos = ships.filter((s) => !s.imoValid);
  const unnamed = ships.filter((s) => !s.name);

  const registry = {
    $schema: './fleet-registry.schema.json',
    provenance: {
      source: 'Wikidata Query Service',
      sourceUrl: SPARQL_ENDPOINT,
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      retrievedAt: new Date().toISOString(),
      queryHash: createHash('sha256').update(QUERY).digest('hex').slice(0, 16),
      generator: 'scripts/seed-fleet.mjs',
      note: 'Vessel identity and specifications only. Contains no deck-plan geometry.',
    },
    stats: {
      ships: ships.length,
      classes: classes.length,
      withMmsi: ships.filter((s) => s.mmsi).length,
      withClass: ships.filter((s) => s.shipClassId).length,
      withTonnage: ships.filter((s) => s.grossTonnage).length,
      invalidImoChecksums: invalidImos.length,
      unnamed: unnamed.length,
    },
    classes,
    ships,
  };

  console.log(
    `  ${ships.length} vessels, ${classes.length} classes ` +
      `(${registry.stats.withClass} vessels classed)`
  );
  if (invalidImos.length) {
    console.warn(`  ${invalidImos.length} vessel(s) have IMO checksum failures:`);
    for (const s of invalidImos.slice(0, 5)) console.warn(`    ${s.imo} ${s.name ?? '(unnamed)'}`);
  }

  if (args.dryRun) {
    console.log('Dry run — nothing written.');
    console.log(`Largest: ${ships.slice(0, 3).map((s) => `${s.name} (${s.grossTonnage} GT)`).join(', ')}`);
    return;
  }

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${args.out}`);
}

main().catch((error) => {
  console.error(`Fleet seed failed: ${error.message}`);
  process.exit(1);
});
