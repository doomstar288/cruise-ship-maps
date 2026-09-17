/**
 * Pure build steps for the fleet registry, kept free of network and file I/O
 * so the rules that decide a ship's status, what an override may change, and
 * when a refresh is too suspicious to publish are all unit-testable.
 *
 * Pipeline (driven by scripts/seed-fleet.mjs):
 *   Wikidata rows → lifecycle (status, category, history)
 *     → carry forward ships the source stopped returning
 *     → apply curated overrides
 *     → diff against the previous registry → guardrails → PR summary
 */

import { isValidImo } from '../src/utils/imo.js';

/** Separates entries inside a GROUP_CONCAT; fields within an entry use "|". */
export const ENTRY_SEPARATOR = ';;';

export const STATUSES = Object.freeze(['in_service', 'on_order', 'retired', 'unknown']);
export const CATEGORIES = Object.freeze(['ocean', 'expedition', 'river', 'ferry', 'other']);

/** Wikidata items that mean a vessel has left service for good. */
const RETIREMENT_EVENTS = new Set([
  'Q336332', // ship breaking
  'Q906512', // shipwrecking
  'Q30880545', // sinking
  'Q29933838', // service retirement
  'Q7497952', // ship decommissioning
]);
const SHIPWRECK_TYPE = 'Q852190';

const RIVER_TYPES = new Set(['Q18916020']); // river cruise ship
const FERRY_TYPES = new Set([
  'Q3276983', // cruiseferry
  'Q25653', // ferry
  'Q3784092', // car ferry
  'Q2072352', // passenger ferry
  'Q1760328', // roll-on/roll-off passenger ship
]);
const OCEAN_TYPES = new Set([
  'Q39804', // cruise ship
  'Q697196', // ocean liner
  'Q2168617', // transatlantic liner
]);

/** Fields a `set` override may change. Identity (imo, wikidataId) is not one. */
export const OVERRIDABLE_FIELDS = Object.freeze([
  'name',
  'mmsi',
  'operator',
  'operatorId',
  'shipClass',
  'shipClassId',
  'builder',
  'grossTonnage',
  'lengthMeters',
  'beamMeters',
  'inServiceYear',
  'retirementYear',
  'maxCapacity',
  'status',
  'category',
]);

/** Guardrail thresholds: a refresh beyond these fails instead of opening a PR. */
export const GUARDRAILS = Object.freeze({
  maxSourceDropRatio: 0.05,
  operatorMinFleet: 5,
  maxOperatorDropRatio: 0.25,
});

const splitEntries = (raw) => (raw ? raw.split(ENTRY_SEPARATOR).filter(Boolean) : []);
const toDate = (raw) => {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};
const yearOf = (date) => (date ? date.getUTCFullYear() : null);

/** Wikidata labels that are really "no name": a bare Q-id or "IMO 1234567". */
export const isPlaceholderName = (label) => !label || /^(Q\d+|IMO \d{7})$/.test(label.trim());

const startTime = (op) => op.start?.getTime() ?? -Infinity;

/**
 * Parses operator statements ("Qid|label|start|end|rank") into a history,
 * oldest first; undated statements sort first as the least informative.
 */
export function parseOperators(raw) {
  return splitEntries(raw)
    .map((entry) => {
      const [id, label, start, end, rank] = entry.split('|');
      return {
        id: id || null,
        name: isPlaceholderName(label) ? null : label,
        start: toDate(start),
        end: toDate(end),
        preferred: rank === 'preferred',
      };
    })
    .filter((op) => op.id)
    .sort((a, b) => startTime(a) - startTime(b) || String(a.id).localeCompare(String(b.id)));
}

/**
 * The operator today, from statements with no end date (or a future one).
 * Wikidata often lists several undated operators at once — Mein Schiff 3 has
 * both TUI Cruises and Celebrity Cruises — so resolution is explicit:
 *   1. a preferred-rank statement (Wikidata's convention for "current"),
 *   2. otherwise the latest start date, if exactly one statement has it,
 *   3. otherwise last run's operator, so an unresolved tie doesn't flip weekly,
 *   4. otherwise the first by Q-id, for determinism.
 * `ambiguous` is true whenever step 3 or 4 decided; those ships need a
 * Wikidata fix or an override.
 * @returns {{ operator: object|null, ambiguous: boolean }}
 */
export function currentOperator(operators, now, previousOperatorId = null) {
  let candidates = operators.filter((op) => !op.end || op.end > now);
  if (candidates.some((op) => op.preferred)) candidates = candidates.filter((op) => op.preferred);
  // One entity can appear in several statements; that alone is not a conflict.
  candidates = [...new Map(candidates.map((op) => [op.id, op])).values()];
  if (candidates.length <= 1) return { operator: candidates[0] ?? null, ambiguous: false };

  const latest = Math.max(...candidates.map(startTime));
  const newest = candidates.filter((op) => startTime(op) === latest);
  if (latest !== -Infinity && newest.length === 1) {
    return { operator: newest[0], ambiguous: false };
  }
  const pool = latest === -Infinity ? candidates : newest;
  const kept = pool.find((op) => op.id === previousOperatorId);
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  return { operator: kept ?? sorted[0], ambiguous: true };
}

/** The official name with no end date, used when the label is a placeholder. */
export function currentOfficialName(raw) {
  for (const entry of splitEntries(raw)) {
    const [name, , end] = entry.split('|');
    if (name && !end && !isPlaceholderName(name)) return name;
  }
  return null;
}

/**
 * Names from "name|start|end" statements that have ended, oldest first,
 * excluding the current name. GROUP_CONCAT order is arbitrary, so the sort is
 * what keeps an unchanged ship from producing a diff.
 */
export function parseFormerNames(raw, currentName) {
  const ended = new Map();
  for (const entry of splitEntries(raw)) {
    const [name, , end] = entry.split('|');
    const endTime = toDate(end)?.getTime();
    if (!name || endTime === undefined || name === currentName) continue;
    ended.set(name, Math.min(endTime, ended.get(name) ?? Infinity));
  }
  return [...ended]
    .sort(([nameA, a], [nameB, b]) => a - b || nameA.localeCompare(nameB))
    .map(([name]) => name);
}

/** Below this, an untyped vessel is too small to assume it's an ocean cruise ship. */
const OCEAN_FALLBACK_MIN_TONNAGE = 10_000;

/**
 * Ocean liners win over ferry typing (several were later typed as both); a
 * ship typed both "cruise ship" and "cruiseferry" is a ferry. Ships typed only
 * as a generic "ship" — Celebrity Xcel among them — are in the registry because
 * a cruise line operates them, so a large one is treated as ocean.
 */
export function deriveCategory(types, grossTonnage = null) {
  if (types.some((t) => RIVER_TYPES.has(t))) return 'river';
  if (types.some((t) => OCEAN_TYPES.has(t) && t !== 'Q39804')) return 'ocean';
  if (types.some((t) => FERRY_TYPES.has(t))) return 'ferry';
  if (types.some((t) => OCEAN_TYPES.has(t))) return 'ocean';
  return grossTonnage >= OCEAN_FALLBACK_MIN_TONNAGE ? 'ocean' : 'other';
}

/**
 * Status from lifecycle evidence, strongest first: a retirement event or date
 * beats everything; a future service entry means on order; a current operator
 * means in service. Anything else is honestly `unknown` rather than guessed.
 */
export function deriveStatus({ events, types, serviceEntry, retirement, operator }, now) {
  if (events.some((e) => RETIREMENT_EVENTS.has(e)) || types.includes(SHIPWRECK_TYPE)) {
    return 'retired';
  }
  if (retirement && retirement <= now) return 'retired';
  if (serviceEntry && serviceEntry > now) return 'on_order';
  if (serviceEntry && operator) return 'in_service';
  return 'unknown';
}

/**
 * Folds a lifecycle row (see LIFECYCLE_QUERY in seed-fleet.mjs) into a ship
 * record: current operator, former operators/names, status and category.
 * `previous` is the same IMO in the last registry, used only for stability
 * when the source is ambiguous or has lost a name.
 */
export function applyLifecycle(ship, row, now, previous = null) {
  const value = (key) => row?.[key]?.value ?? null;
  const events = value('events')?.split('|').filter(Boolean) ?? [];
  const types = value('types')?.split('|').filter(Boolean) ?? [];
  const serviceEntry = toDate(value('serviceEntry'));
  const retirement = toDate(value('retirement'));

  const operators = parseOperators(value('operators'));
  const { operator: current, ambiguous } = currentOperator(operators, now, previous?.operatorId);
  const name =
    (isPlaceholderName(ship.name) ? null : ship.name) ??
    currentOfficialName(value('names')) ??
    previous?.name ??
    null;
  const formerOperators = [
    ...new Set(
      operators
        .filter((op) => op !== current && op.end && op.end <= now && op.name)
        .map((op) => op.name)
    ),
  ].filter((name) => name !== current?.name);

  return {
    ...ship,
    name,
    operator: current?.name ?? null,
    operatorId: current?.id ?? null,
    ...(ambiguous && { operatorAmbiguous: true }),
    status: deriveStatus({ events, types, serviceEntry, retirement, operator: current }, now),
    category: deriveCategory(types, ship.grossTonnage),
    retirementYear: yearOf(retirement),
    formerNames: parseFormerNames(value('names'), name),
    formerOperators,
  };
}

/**
 * Ships in the previous registry that Wikidata no longer returns are kept, not
 * deleted: a vanished row is far more often a Wikidata edit than a vanished
 * ship, and dropping it would break any deck plan attached to that IMO.
 * Ships that existed only because of an `add` or `include` override are not
 * carried — removing the override is how you remove them.
 */
export function carryForward(sourced, previous, today) {
  const sourcedImos = new Set(sourced.map((s) => s.imo));
  const carried = (previous?.ships ?? [])
    .filter((s) => !sourcedImos.has(s.imo) && s.source !== 'override' && !s.includedByOverride)
    .map((s) => ({
      // Registries written before lifecycle fields existed lack these.
      status: 'unknown',
      category: 'other',
      formerNames: [],
      formerOperators: [],
      ...s,
      sourceMissingSince: s.sourceMissingSince ?? today,
    }));
  return [...sourced, ...carried];
}

/** Returns a list of problems; an empty list means the overrides file is valid. */
export function validateOverrides(file) {
  const errors = [];
  const entries = file?.overrides;
  if (!Array.isArray(entries)) return ['overrides file must have an "overrides" array'];

  const seen = new Set();
  entries.forEach((entry, i) => {
    const at = `overrides[${i}]${entry?.imo ? ` (IMO ${entry.imo})` : ''}`;
    if (!/^\d{7}$/.test(entry?.imo ?? '')) errors.push(`${at}: "imo" must be a 7-digit string`);
    if (seen.has(entry?.imo)) errors.push(`${at}: duplicate IMO — merge into one entry`);
    seen.add(entry?.imo);
    if (!entry?.reason?.trim()) errors.push(`${at}: "reason" is required`);

    const actions = ['set', 'add', 'exclude', 'include'].filter(
      (key) => entry?.[key] !== undefined
    );
    // `include` brings a ship in; pairing it with `set` to correct that ship is allowed.
    const combinable =
      actions.length === 2 && actions.includes('include') && actions.includes('set');
    if (actions.length !== 1 && !combinable) {
      errors.push(
        `${at}: needs exactly one of "set", "add", "exclude", "include" (or "include" with "set")`
      );
      return;
    }
    if (entry.include !== undefined && !/^Q\d+$/.test(entry.include)) {
      errors.push(`${at}: "include" must be a Wikidata item id like "Q113679865"`);
    }
    const fields = entry.set ?? entry.add;
    if (fields) {
      for (const key of Object.keys(fields)) {
        if (!OVERRIDABLE_FIELDS.includes(key)) errors.push(`${at}: "${key}" cannot be overridden`);
      }
      if (fields.status !== undefined && !STATUSES.includes(fields.status)) {
        errors.push(`${at}: status must be one of ${STATUSES.join(', ')}`);
      }
      if (fields.category !== undefined && !CATEGORIES.includes(fields.category)) {
        errors.push(`${at}: category must be one of ${CATEGORIES.join(', ')}`);
      }
    }
    if (entry.add && !entry.add.name) errors.push(`${at}: "add" needs at least a "name"`);
    if (entry.exclude !== undefined && entry.exclude !== true) {
      errors.push(`${at}: "exclude" must be true`);
    }
  });
  return errors;
}

/**
 * Applies curated corrections on top of source data. Every touched ship records
 * which fields were overridden, so the registry never passes off a manual fix
 * as Wikidata's. Overrides that no longer match anything are reported as stale.
 */
export function applyOverrides(ships, file) {
  const byImo = new Map(ships.map((s) => [s.imo, s]));
  const stale = [];

  for (const entry of file?.overrides ?? []) {
    let existing = byImo.get(entry.imo);
    if (entry.include) {
      // The seeder already queried this item; confirm it arrived under this IMO.
      if (existing?.wikidataId !== entry.include) {
        stale.push({ imo: entry.imo, action: 'include' });
        continue;
      }
      existing = { ...existing, includedByOverride: true };
      byImo.set(entry.imo, existing);
    }
    if (entry.exclude) {
      if (existing) byImo.delete(entry.imo);
      else stale.push({ imo: entry.imo, action: 'exclude' });
    } else if (entry.set) {
      if (!existing) {
        stale.push({ imo: entry.imo, action: 'set' });
        continue;
      }
      byImo.set(entry.imo, {
        ...existing,
        ...entry.set,
        overriddenFields: [
          ...new Set([...(existing.overriddenFields ?? []), ...Object.keys(entry.set)]),
        ].sort(),
      });
    } else if (entry.add) {
      if (existing?.source !== 'override' && existing) {
        // Wikidata caught up: the add is redundant and should be deleted.
        stale.push({ imo: entry.imo, action: 'add' });
        continue;
      }
      byImo.set(entry.imo, {
        ...emptyShip(entry.imo),
        ...entry.add,
        source: 'override',
        overriddenFields: Object.keys(entry.add).sort(),
      });
    }
  }
  return { ships: [...byImo.values()], stale };
}

function emptyShip(imo) {
  return {
    wikidataId: null,
    imo,
    imoValid: isValidImo(imo),
    mmsi: null,
    name: null,
    operator: null,
    operatorId: null,
    shipClass: null,
    shipClassId: null,
    builder: null,
    grossTonnage: null,
    lengthMeters: null,
    beamMeters: null,
    inServiceYear: null,
    retirementYear: null,
    maxCapacity: null,
    status: 'unknown',
    category: 'other',
    formerNames: [],
    formerOperators: [],
  };
}

const SPEC_FIELDS = [
  'grossTonnage',
  'lengthMeters',
  'beamMeters',
  'maxCapacity',
  'builder',
  'shipClass',
  'inServiceYear',
  'mmsi',
];

/** What changed between two registries, keyed by IMO. */
export function diffRegistries(previous, next) {
  const before = new Map((previous?.ships ?? []).map((s) => [s.imo, s]));
  const after = new Map(next.ships.map((s) => [s.imo, s]));
  const diff = {
    added: [],
    removed: [],
    newlyMissingFromSource: [],
    statusChanges: [],
    renames: [],
    operatorChanges: [],
    specChanges: [],
  };

  for (const [imo, ship] of after) {
    const old = before.get(imo);
    if (!old) {
      diff.added.push(ship);
      continue;
    }
    if (ship.sourceMissingSince && !old.sourceMissingSince) diff.newlyMissingFromSource.push(ship);
    // A registry from before statuses existed has nothing to compare against.
    if (old.status && old.status !== ship.status) {
      diff.statusChanges.push({ ship, from: old.status, to: ship.status });
    }
    if (old.name && ship.name && old.name !== ship.name) {
      diff.renames.push({ ship, from: old.name, to: ship.name });
    }
    if (old.operator !== ship.operator) {
      diff.operatorChanges.push({ ship, from: old.operator, to: ship.operator });
    }
    const fields = SPEC_FIELDS.filter((f) => old[f] !== ship[f]);
    if (fields.length) diff.specChanges.push({ ship, fields });
  }
  for (const [imo, ship] of before) {
    if (!after.has(imo)) diff.removed.push(ship);
  }
  return diff;
}

/** Ships that came from Wikidata this run (not carried forward, not hand-added). */
const isSourced = (s) => !s.sourceMissingSince && s.source !== 'override';

function inServiceByOperator(registry) {
  const counts = new Map();
  for (const ship of registry?.ships ?? []) {
    if (ship.status !== 'in_service' || !ship.operator) continue;
    counts.set(ship.operator, (counts.get(ship.operator) ?? 0) + 1);
  }
  return counts;
}

/**
 * Refuses refreshes that look like a broken query or a vandalised source rather
 * than real fleet changes. Returns human-readable failures; empty means publish.
 */
export function checkGuardrails(previous, next, limits = GUARDRAILS) {
  if (!previous?.ships?.length) return [];
  const failures = [];

  const prevSourced = previous.ships.filter(isSourced).length;
  const nextSourced = next.ships.filter(isSourced).length;
  if (prevSourced && nextSourced < prevSourced * (1 - limits.maxSourceDropRatio)) {
    failures.push(
      `Wikidata returned ${nextSourced} ships, down from ${prevSourced} ` +
        `(more than ${limits.maxSourceDropRatio * 100}% drop) — likely a query or endpoint problem`
    );
  }

  const before = inServiceByOperator(previous);
  const after = inServiceByOperator(next);
  for (const [operator, count] of before) {
    if (count < limits.operatorMinFleet) continue;
    const now = after.get(operator) ?? 0;
    if (now < count * (1 - limits.maxOperatorDropRatio)) {
      failures.push(
        `${operator} in-service fleet fell from ${count} to ${now} ` +
          `(more than ${limits.maxOperatorDropRatio * 100}% drop)`
      );
    }
  }
  return failures;
}

const shipLabel = (s) => `${s.name ?? '(unnamed)'} (IMO ${s.imo})`;

function section(title, items, render, limit = 25) {
  if (!items.length) return [];
  const lines = [`### ${title} (${items.length})`, ''];
  for (const item of items.slice(0, limit)) lines.push(`- ${render(item)}`);
  if (items.length > limit) lines.push(`- …and ${items.length - limit} more`);
  lines.push('');
  return lines;
}

/** Markdown for the refresh PR body: the headline numbers, then each change. */
export function renderSummary({ diff, registry, stale = [], guardrailFailures = [] }) {
  const { stats } = registry;
  const headline = [
    `+${diff.added.length} new`,
    `${diff.statusChanges.length} status changes`,
    `${diff.renames.length} renames`,
    `${diff.operatorChanges.length} operator changes`,
    `${diff.specChanges.length} spec updates`,
  ].join(', ');

  const lines = [
    '## Fleet registry refresh',
    '',
    `**${headline}**`,
    '',
    `${stats.ships} ships · ` +
      STATUSES.map((s) => `${stats.byStatus[s] ?? 0} ${s.replace('_', ' ')}`).join(' · '),
    '',
  ];

  if (guardrailFailures.length) {
    lines.push('> [!CAUTION]', '> Guardrails tripped — review carefully before merging:');
    for (const failure of guardrailFailures) lines.push(`> - ${failure}`);
    lines.push('');
  }

  lines.push(
    ...section(
      'New ships',
      diff.added,
      (s) => `${shipLabel(s)} — ${s.operator ?? 'no operator'}, ${s.status}`
    ),
    ...section(
      'Status changes',
      diff.statusChanges,
      (c) => `${shipLabel(c.ship)}: ${c.from} → ${c.to}`
    ),
    ...section('Renames', diff.renames, (c) => `IMO ${c.ship.imo}: ${c.from} → ${c.to}`),
    ...section(
      'Operator changes',
      diff.operatorChanges,
      (c) => `${shipLabel(c.ship)}: ${c.from ?? 'none'} → ${c.to ?? 'none'}`
    ),
    ...section(
      'Ambiguous operators (several current operators on Wikidata)',
      registry.ships.filter(
        (s) => s.operatorAmbiguous && !s.overriddenFields?.includes('operator')
      ),
      (s) => `${shipLabel(s)} — kept ${s.operator ?? 'none'}; fix on Wikidata or add an override`,
      15
    ),
    ...section(
      'No longer returned by Wikidata (kept, flagged)',
      diff.newlyMissingFromSource,
      (s) => `${shipLabel(s)} — check whether its Wikidata item was edited or merged`
    ),
    ...section('Removed', diff.removed, (s) => `${shipLabel(s)} — removed by an override`),
    ...section(
      'Spec updates',
      diff.specChanges,
      (c) => `${shipLabel(c.ship)}: ${c.fields.join(', ')}`,
      15
    ),
    ...section('Stale overrides', stale, (s) =>
      s.action === 'include'
        ? `IMO ${s.imo} (\`include\`): Wikidata item not found or its IMO differs — fix or delete the override`
        : `IMO ${s.imo} (\`${s.action}\`) no longer matches — delete it from scripts/fleet-overrides.json`
    )
  );

  return `${lines.join('\n').trimEnd()}\n`;
}
