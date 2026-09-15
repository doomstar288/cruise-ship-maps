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

Options: `--limit N` (sample), `--dry-run` (no write), `--out PATH`.
Output: `public/data/fleet-registry.json` (~312 KB, served at runtime rather
than bundled, so the catalogue can grow without inflating the app bundle).

A scheduled workflow (`.github/workflows/refresh-fleet.yml`) re-runs this weekly
and opens a PR when the data changes, so updates arrive as reviewable diffs.

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
   aggregates with `GROUP BY` + `SAMPLE`/`MAX`/`MIN`.

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
- Coverage is uneven: of 689 vessels, 552 have tonnage and only 190 are assigned
  a ship class, so class-based leverage applies to the classed subset.
- `maxCapacity` comes from `P1083`, which conflates lower-berth and maximum
  occupancy across entries; treat it as approximate.
- River-cruise and historic vessels are included where they meet the criteria;
  filter by operator or tonnage if only ocean-going ships are wanted.
