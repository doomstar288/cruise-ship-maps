# Fleet Registry Seeding (Wikidata)

How the platform learns **which cruise ships exist** without scraping any cruise
line. Deck geometry is a separate problem; this establishes vessel identity.

## Why Wikidata

- **CC0 licensed** — no attribution or redistribution constraints, unlike deck
  plans or aggregator sites whose compilations are copyrighted.
- **Community-maintained** — new builds appear as they are announced, so the
  registry stays current without us monitoring press releases.
- **Structured** — IMO/MMSI, operator, ship class, tonnage, dimensions, and
  build year are queryable properties, not prose to be parsed.

## Running it

```bash
npm run seed:fleet
```

Options: `--limit N` (sample; skips reconciliation), `--dry-run` (no write),
`--out PATH`, `--overrides PATH`, `--summary PATH` (write the change report as
Markdown), `--allow-large-change` (publish despite tripped guardrails).
Output: `public/data/fleet-registry.json` (served at runtime rather than
bundled, so the catalogue can grow without inflating the app bundle).

A scheduled workflow (`.github/workflows/refresh-fleet.yml`) re-runs this weekly
and opens a PR when the data changes, so updates arrive as reviewable diffs.

## Keeping it current

The pipeline has three layers; pure logic lives in
`scripts/fleet-registry-build.mjs` and is unit-tested without network access.

```
Wikidata (identity + lifecycle queries)
  → status / category / operator history
  → carry forward ships Wikidata stopped returning
  → scripts/fleet-overrides.json (hand corrections)
  → guardrails → write only if content changed → PR with change summary
```

### 1. Lifecycle from Wikidata

Each ship gets `status` (`in_service`, `on_order`, `retired`, `unknown`),
`category` (`ocean`, `expedition`, `river`, `ferry`, `other`), `formerNames`,
`formerOperators` and `retirementYear`.

- **Operator is the *current* one.** Operator statements are read with their
  start/end qualifiers. Previously any operator a ship ever had could be picked,
  which counted sold ships in their former line's fleet.
- **Ambiguous operators are flagged, not guessed.** Wikidata often lists several
  undated operators at once (Mein Schiff 3: TUI Cruises *and* Celebrity
  Cruises). Resolution: preferred rank → latest start date → last run's value
  (so it can't flip weekly). Ships decided by the fallback carry
  `operatorAmbiguous: true` and are listed in the refresh PR.
- **Status** is `retired` on a scrapping/sinking/decommissioning event or a
  past retirement date, `on_order` for a future service entry, `in_service` when
  a ship has entered service and has a current operator, otherwise `unknown`.
- `expedition` is never inferred (Wikidata has no usable type); set it via an
  override.

### 2. Overrides (`scripts/fleet-overrides.json`)

Hand corrections keyed by IMO. Each entry needs a `reason` (and ideally a
`source`) and exactly one action:

```json
{ "imo": "9210218", "reason": "…", "source": "https://…",
  "set": { "operator": "Azamara", "operatorId": "Q2875081" } }
{ "imo": "1234567", "reason": "not on Wikidata yet", "add": { "name": "…" } }
{ "imo": "7654321", "reason": "a ferry, not a cruise ship", "exclude": true }
```

Overridden ships list the hand-set fields in `overriddenFields`, so a manual
fix is never mistaken for sourced data. After editing, run `npm run seed:fleet`;
a test fails if the committed registry doesn't reflect the overrides file.
Fix the Wikidata item too where possible — the refresh PR lists overrides that
become stale once Wikidata catches up.

### 3. Guardrails and review

- **Never delete.** A ship Wikidata stops returning is kept with
  `sourceMissingSince`; a vanished row is usually an edit or merge, and deck
  plans are attached by IMO. Remove a ship with an `exclude` override.
- **Refuse suspicious refreshes.** The run fails without writing if Wikidata
  returns >5% fewer ships than last time, or an operator with ≥5 in-service
  ships loses >25% of them. The workflow run summary shows why; re-run it with
  `allow_large_change` once the change is confirmed genuine.
- **Deterministic output.** Multi-valued fields aggregate with `MIN`/`MAX`, not
  `SAMPLE` (whose pick varies per run and produced spurious builder changes),
  and lists are sorted. An unchanged fleet leaves the file untouched, so no PR.
- **Reviewable PRs.** The PR body is a change summary: new ships, status
  changes, renames, operator changes, ambiguous operators, ships missing from
  the source, spec updates and stale overrides.

## Query design decisions

Three non-obvious problems, each found by running the query rather than
reasoning about it:

1. **Ship typing is inconsistent.** Matching only `instance of → cruise ship`
   (`P31/P279* wd:Q39804`) misses vessels typed as generic "ship". Celebrity
   Xcel is typed `Q11446` (ship) and is reachable *only* via its operator. The
   query therefore unions three routes: instance-of cruise ship, vessel class is
   a cruise-ship class, or **operator is a cruise line** (`Q946499`).

2. **Ship names live under the `mul` label.** Wikidata migrated many proper
   nouns to the multilingual (`mul`) language code, so an English-only label
   service silently returns Q-ids instead of names. Labels resolve against
   `"en,mul"`, and any remaining `Q\d+` label is normalized to `null`.

3. **Multi-valued properties multiply rows.** A ship with two capacity values
   returns two rows, cartesian-joined with every other optional. The query
   aggregates with `GROUP BY` + `MAX`/`MIN`, and lifecycle data (operator and
   name histories, events) comes from a second query joined in JS to stay well
   under the Query Service's 60s timeout.

## Validation

IMO numbers carry a check digit (first six digits weighted 7·6·5·4·3·2; the last
digit of the sum is the seventh digit). `src/utils/imo.js` verifies this, giving
a real correctness signal with no network call.

This immediately caught a defect: the app's hardcoded Celebrity Xcel IMO
`9938430` **fails the checksum** (implies check digit 2, has 0) and was never a
valid IMO. The correct value is `9884136`, confirmed by Wikidata. Historic
pre-IMO-scheme vessels (e.g. RMS Mauretania) also fail and are flagged, not
dropped — `stats.invalidImoChecksums` surfaces the count.

## What this unlocks: sister-ship leverage

Vessels in a class share the large majority of their layout, so one digitized
deck plan seeds every sister. The registry emits a `classes` index for exactly
this: **42 classes cover 179 vessels**, and the top 10 classes alone cover 75.

```js
import { getSisterShips, getClassesByCoverage } from '../src/data/fleetRegistry.js';

getSisterShips(registry, '9829930');
// Icon of the Seas → Star, Legend, Hero of the Seas
```

Prioritizing digitization by `getClassesByCoverage()` turns an O(ships) effort
into roughly O(classes).

## Scope and limits

- Identity and specifications only — **no deck geometry, no cabin inventory**.
- Coverage is uneven: of 691 vessels, 553 have tonnage, 376 have a current
  operator and only 191 are assigned a ship class, so class-based leverage
  applies to the classed subset. 194 ships have `unknown` status.
- `maxCapacity` comes from `P1083`, which conflates lower-berth and maximum
  occupancy across entries; treat it as approximate.
- River-cruise, ferry and historic vessels are included where they meet the
  criteria; filter by `category` and `status` if only active ocean ships are
  wanted (`getShipsByOperator(registry, name, { status: 'in_service' })`).
