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
 * Two queries run: one for identity and specs, one for lifecycle (operator
 * history, names, events, service dates). They are joined here rather than in
 * SPARQL because a single query with every OPTIONAL multiplies rows enough to
 * risk the Query Service's 60s timeout.
 *
 * The result is then carried forward from the previous registry, corrected by
 * scripts/fleet-overrides.json, and checked by guardrails before it is written
 * (see scripts/fleet-registry-build.mjs).
 *
 * Usage:
 *   node scripts/seed-fleet.mjs [--limit N] [--out PATH] [--dry-run]
 *     [--overrides PATH] [--summary PATH] [--allow-large-change]
 *
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isValidImo, normalizeImo } from '../src/utils/imo.js';
import {
  CATEGORIES,
  ENTRY_SEPARATOR,
  STATUSES,
  applyLifecycle,
  applyOverrides,
  carryForward,
  checkGuardrails,
  diffRegistries,
  isPlaceholderName,
  renderSummary,
  validateOverrides,
} from './fleet-registry-build.mjs';
import { SPARQL_ENDPOINT, runSparql } from './wikimedia.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const DEFAULT_OUT = resolve(REPO_ROOT, 'public/data/fleet-registry.json');
const DEFAULT_OVERRIDES = resolve(REPO_ROOT, 'scripts/fleet-overrides.json');

/**
 * A vessel qualifies four ways, because Wikidata typing is inconsistent:
 *   1. it is (a subclass of) a cruise ship,
 *   2. its vessel class is a cruise-ship class, or
 *   3. its operator is a cruise line.
 * Celebrity Xcel, for example, is typed only as a generic "ship" (Q11446) and
 * is reachable solely via its operator, so rule 3 is not optional.
 *
 * Labels fall back to "mul" (multilingual) because Wikidata migrated many
 * proper nouns — including most ship names — out of per-language labels.
 *
 * Multi-valued fields aggregate with MIN/MAX, never SAMPLE: SAMPLE's pick
 * varies between runs, which turned every weekly refresh into spurious
 * "builder changed" diffs, and sampled a class id and class label
 * independently so they could describe different classes. The class id and
 * label are packed together for the same reason.
 */
const membership = (includeQids = []) => `
  ?ship wdt:P458 ?imo .
  {   ?ship wdt:P31/wdt:P279* wd:Q39804 }
  UNION
  {   ?ship wdt:P289 ?cCls . ?cCls wdt:P279* wd:Q39804 }
  UNION
  {   ?ship wdt:P137 ?cOp .  ?cOp wdt:P31/wdt:P279* wd:Q946499 }${
    // 4. named by an `include` override: a real cruise ship whose Wikidata item
    //    matches none of the rules above (typically typed only as "ship").
    includeQids.length
      ? `
  UNION
  {   VALUES ?ship { ${includeQids.map((q) => `wd:${q}`).join(' ')} } }`
      : ''
  }
`;

const identityQuery = (includeQids) => `
SELECT ?ship ?shipLabel ?imo
       (MIN(?mmsi)             AS ?mmsiV)
       (MIN(?classPair)        AS ?classV)
       (MIN(?builderLabel)     AS ?builderV)
       (MAX(?tonnage)          AS ?gt)
       (MAX(?length)           AS ?loa)
       (MAX(?beam)             AS ?beamV)
       (MIN(?inService)        AS ?entered)
       (MAX(?capacity)         AS ?maxCapacity)
WHERE {
${membership(includeQids)}
  OPTIONAL { ?ship wdt:P587 ?mmsi }
  OPTIONAL {
    ?ship wdt:P289 ?class .
    ?class rdfs:label ?classLabel .
    FILTER(LANG(?classLabel) IN ("en","mul"))
    BIND(CONCAT(STRAFTER(STR(?class), "entity/"), "|", ?classLabel) AS ?classPair)
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

/**
 * Lifecycle facts, one row per ship. Operator and official-name statements are
 * read with their start/end qualifiers so the *current* operator can be chosen
 * — a plain wdt:P137 returns every operator a ship ever had, which is how sold
 * ships ended up counted in their former line's fleet. Entries are packed as
 * "field|field|..." joined by ENTRY_SEPARATOR and unpacked in JS.
 *
 * Types include a river/cruiseferry class supertype so a ship typed only by its
 * class (e.g. a Dmitriy Furmanov-class motorship) still categorises as river.
 */
const lifecycleQuery = (includeQids) => `
SELECT ?ship
       (GROUP_CONCAT(DISTINCT ?opEntry; separator="${ENTRY_SEPARATOR}") AS ?operators)
       (GROUP_CONCAT(DISTINCT ?nameEntry; separator="${ENTRY_SEPARATOR}") AS ?names)
       (GROUP_CONCAT(DISTINCT STRAFTER(STR(?event), "entity/"); separator="|") AS ?events)
       (GROUP_CONCAT(DISTINCT STRAFTER(STR(?type), "entity/"); separator="|") AS ?types)
       (MIN(?entry) AS ?serviceEntry)
       (MAX(?retire) AS ?retirement)
WHERE {
${membership(includeQids)}
  OPTIONAL {
    ?ship p:P137 ?opSt . ?opSt ps:P137 ?op .
    ?opSt wikibase:rank ?opRank .
    FILTER(?opRank != wikibase:DeprecatedRank)
    OPTIONAL { ?opSt pq:P580 ?opStart }
    OPTIONAL { ?opSt pq:P582 ?opEnd }
    OPTIONAL { ?op rdfs:label ?opEn . FILTER(LANG(?opEn) = "en") }
    OPTIONAL { ?op rdfs:label ?opMul . FILTER(LANG(?opMul) = "mul") }
    BIND(CONCAT(STRAFTER(STR(?op), "entity/"), "|", COALESCE(?opEn, ?opMul, ""), "|",
                COALESCE(STR(?opStart), ""), "|", COALESCE(STR(?opEnd), ""), "|",
                IF(?opRank = wikibase:PreferredRank, "preferred", "normal")) AS ?opEntry)
  }
  OPTIONAL {
    ?ship p:P1448 ?nSt . ?nSt ps:P1448 ?nm .
    OPTIONAL { ?nSt pq:P580 ?nStart }
    OPTIONAL { ?nSt pq:P582 ?nEnd }
    BIND(CONCAT(STR(?nm), "|", COALESCE(STR(?nStart), ""), "|", COALESCE(STR(?nEnd), "")) AS ?nameEntry)
  }
  OPTIONAL { ?ship wdt:P793 ?event }
  OPTIONAL {
    { ?ship wdt:P31 ?type }
    UNION
    { ?ship wdt:P289/wdt:P279* ?type . VALUES ?type { wd:Q18916020 wd:Q3276983 } }
  }
  OPTIONAL { ?ship wdt:P729 ?entry }
  OPTIONAL { ?ship wdt:P730|wdt:P576 ?retire }
}
GROUP BY ?ship
`;

function parseArgs(argv) {
  const args = {
    limit: null,
    out: DEFAULT_OUT,
    overrides: DEFAULT_OVERRIDES,
    summary: null,
    dryRun: false,
    allowLargeChange: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--out') args.out = resolve(process.cwd(), argv[++i]);
    else if (arg === '--overrides') args.overrides = resolve(process.cwd(), argv[++i]);
    else if (arg === '--summary') args.summary = resolve(process.cwd(), argv[++i]);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--allow-large-change') args.allowLargeChange = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/seed-fleet.mjs [--limit N] [--out PATH] [--dry-run]\n' +
          '  [--overrides PATH] [--summary PATH] [--allow-large-change]'
      );
      process.exit(0);
    }
  }
  return args;
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

function normalizeRow(binding) {
  const imo = normalizeImo(value(binding, 'imo'));
  const name = value(binding, 'shipLabel');
  const [classId, className] = value(binding, 'classV')?.split(/\|(.*)/s) ?? [];
  const wikidataId = qid(value(binding, 'ship'));

  return {
    wikidataId,
    imo,
    imoValid: isValidImo(imo),
    mmsi: value(binding, 'mmsiV'),
    name: isPlaceholderName(name) ? null : name,
    // Filled from the lifecycle query; declared here to keep field order stable.
    operator: null,
    operatorId: null,
    shipClass: className || null,
    shipClassId: classId || null,
    builder: value(binding, 'builderV'),
    grossTonnage: numeric(binding, 'gt'),
    lengthMeters: numeric(binding, 'loa'),
    beamMeters: numeric(binding, 'beamV'),
    inServiceYear: year(binding, 'entered'),
    maxCapacity: numeric(binding, 'maxCapacity'),
  };
}

/**
 * Prefers the record with more populated fields when an IMO repeats; ties go
 * to the lower Q-id so the choice doesn't depend on result order.
 */
function completeness(ship) {
  return Object.values(ship).filter((v) => v !== null && v !== false).length;
}

function dedupeByImo(ships) {
  const byImo = new Map();
  for (const ship of ships) {
    const existing = byImo.get(ship.imo);
    const better =
      !existing ||
      completeness(ship) > completeness(existing) ||
      (completeness(ship) === completeness(existing) &&
        ship.wikidataId.localeCompare(existing.wikidataId) < 0);
    if (better) {
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
      classes.set(ship.shipClassId, { id: ship.shipClassId, name: ship.shipClass, ships: [] });
    }
    classes.get(ship.shipClassId).ships.push(ship);
  }
  return [...classes.values()]
    .map(({ id, name, ships: members }) => ({
      id,
      name,
      operator: dominantOperator(members),
      imos: members.map((s) => s.imo).sort(),
      shipCount: members.length,
    }))
    .sort((a, b) => b.shipCount - a.shipCount || String(a.name).localeCompare(String(b.name)));
}

/**
 * The operator most of a class sails for today. Retired sisters have no
 * current operator, so the first member alone is not a reliable answer.
 */
function dominantOperator(members) {
  const counts = new Map();
  for (const { operator } of members) {
    if (operator) counts.set(operator, (counts.get(operator) ?? 0) + 1);
  }
  let best = null;
  for (const [operator, count] of counts) {
    if (!best || count > best.count || (count === best.count && operator < best.operator)) {
      best = { operator, count };
    }
  }
  return best?.operator ?? null;
}

async function readJson(path, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

/** Registry content without the timestamp, so an unchanged fleet writes nothing. */
const contentOf = (registry) =>
  JSON.stringify({ ...registry, provenance: { ...registry?.provenance, retrievedAt: null } });

const countBy = (ships, key, keys) =>
  Object.fromEntries(keys.map((k) => [k, ships.filter((s) => s[key] === k).length]));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const overrides = await readJson(args.overrides, { optional: true });
  const overrideErrors = overrides ? validateOverrides(overrides) : [];
  if (overrideErrors.length) {
    throw new Error(`Invalid overrides file:\n  ${overrideErrors.join('\n  ')}`);
  }
  const previous = await readJson(args.out, { optional: true });

  const includeQids = [
    ...new Set((overrides?.overrides ?? []).map((o) => o.include).filter(Boolean)),
  ].sort();
  const QUERY = identityQuery(includeQids);
  const LIFECYCLE_QUERY = lifecycleQuery(includeQids);
  const query = args.limit ? `${QUERY}\nLIMIT ${args.limit}` : QUERY;
  console.log('Querying Wikidata for cruise vessels...');
  const started = Date.now();
  const [raw, lifecycleRaw] = [await runSparql(query), await runSparql(LIFECYCLE_QUERY)];
  const bindings = raw.results.bindings;
  const lifecycle = new Map(
    lifecycleRaw.results.bindings.map((row) => [qid(value(row, 'ship')), row])
  );
  console.log(
    `  ${bindings.length} rows (+${lifecycle.size} lifecycle) in ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s`
  );

  const previousByImo = new Map((previous?.ships ?? []).map((s) => [s.imo, s]));
  const sourced = dedupeByImo(bindings.map(normalizeRow).filter((s) => s.imo)).map((ship) =>
    applyLifecycle(ship, lifecycle.get(ship.wikidataId), now, previousByImo.get(ship.imo))
  );
  // A sampled run would mark every unsampled ship as missing, so only full
  // runs reconcile against the previous registry.
  const merged = args.limit ? sourced : carryForward(sourced, previous, today);
  const { ships: corrected, stale } = applyOverrides(merged, overrides);
  const ships = corrected.sort(
    (a, b) => (b.grossTonnage ?? 0) - (a.grossTonnage ?? 0) || a.imo.localeCompare(b.imo)
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
      retrievedAt: now.toISOString(),
      queryHash: createHash('sha256')
        .update(QUERY + LIFECYCLE_QUERY)
        .digest('hex')
        .slice(0, 16),
      generator: 'scripts/seed-fleet.mjs',
      overrides: 'scripts/fleet-overrides.json',
      note:
        'Vessel identity and specifications only. Contains no deck-plan geometry. ' +
        'Fields listed in a ship\'s "overriddenFields" were corrected by hand, not sourced.',
    },
    stats: {
      ships: ships.length,
      classes: classes.length,
      byStatus: countBy(ships, 'status', STATUSES),
      byCategory: countBy(ships, 'category', CATEGORIES),
      withOperator: ships.filter((s) => s.operator).length,
      withMmsi: ships.filter((s) => s.mmsi).length,
      withClass: ships.filter((s) => s.shipClassId).length,
      withTonnage: ships.filter((s) => s.grossTonnage).length,
      overridden: ships.filter((s) => s.overriddenFields?.length).length,
      operatorAmbiguous: ships.filter((s) => s.operatorAmbiguous).length,
      missingFromSource: ships.filter((s) => s.sourceMissingSince).length,
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
  console.log(`  status: ${STATUSES.map((s) => `${registry.stats.byStatus[s]} ${s}`).join(', ')}`);
  if (invalidImos.length) {
    console.warn(`  ${invalidImos.length} vessel(s) have IMO checksum failures:`);
    for (const s of invalidImos.slice(0, 5)) console.warn(`    ${s.imo} ${s.name ?? '(unnamed)'}`);
  }
  for (const s of stale) console.warn(`  stale override: IMO ${s.imo} (${s.action})`);

  const guardrailFailures = args.limit ? [] : checkGuardrails(previous, registry);
  const diff = diffRegistries(previous, registry);
  const summary = renderSummary({ diff, registry, stale, guardrailFailures });
  if (args.summary) {
    await mkdir(dirname(args.summary), { recursive: true });
    await writeFile(args.summary, summary, 'utf8');
  }
  console.log(`\n${summary}`);

  if (guardrailFailures.length && !args.allowLargeChange) {
    throw new Error(
      'Guardrails tripped; registry not written. Re-run with --allow-large-change ' +
        'once the changes above are confirmed genuine.'
    );
  }

  if (args.dryRun) {
    console.log('Dry run — nothing written.');
    return;
  }
  if (previous && contentOf(previous) === contentOf(registry)) {
    console.log('No fleet changes — registry left untouched.');
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
