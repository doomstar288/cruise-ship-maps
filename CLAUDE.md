# Cruise Ship Maps

A React 19 + Vite + Leaflet viewer for deck maps of Celebrity Cruises ships (14 ships), and — more
importantly — the **producer of "Ship Map Pack v1"**: static, versioned JSON (`public/v1/ships/…`)
published on GitHub Pages and consumed by the Gangway app (repo `big-trip-planner`; **"AuraTrip" is
Gangway's old name** and still appears in docs and code comments). Plain JavaScript/JSX, no TypeScript.
GitHub: `doomstar288/cruise-ship-maps` (public, MIT). Facts verified 2026-11-27.

**There is no backend.** The "REST API" in `docs/architecture/system_architecture_and_scaling.md` is a
design that was never built: no server, database, Turborepo or PostGIS exists here. The pack files'
paths mirror those routes so a client could later swap a static base URL for a live API.

## Start here

| You want to…                                       | Read                                                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the published JSON contract             | [docs/architecture/ship_map_pack.md](docs/architecture/ship_map_pack.md), then `…_routing.md`, `…_hours.md`, `…_entrances.md`, `…_position_confidence.md` |
| Add or refresh fleet/ship data                     | [docs/research/fleet_registry_seeding.md](docs/research/fleet_registry_seeding.md)                                                                        |
| Check packs against official deck plans            | [docs/research/official_deck_plan_svgs.md](docs/research/official_deck_plan_svgs.md)                                                                      |
| See what's planned (two-repo roadmap with Gangway) | [docs/roadmap/auratrip_integration_onboard_wayfinding.md](docs/roadmap/auratrip_integration_onboard_wayfinding.md)                                        |
| Any other doc, and which are real vs. aspirational | [docs/README.md](docs/README.md)                                                                                                                          |

## Commands (Node 24, see `.nvmrc`)

```bash
npm ci                     # exactly what CI does
npm run dev                # Vite on http://localhost:8766 (strictPort — fails if taken)
npm test                   # vitest run: jsdom, globals; covers src/ AND scripts/*.test.mjs
npm run test:coverage      # what CI runs
npm run lint               # eslint (flat config)
npm run format:check       # prettier; CI enforces it. `npm run format` writes, `lint:fix` fixes
npm run build              # runs export:packs first (prebuild), then vite build → dist/
npm run check:bundle-size  # app bundle vs scripts/bundle-size-baseline.json (CI budget)
```

`npm run build` is safe: its `prebuild` regenerates the packs deterministically and leaves no tracked
changes (checked 2026-11-27). Data scripts: `export:packs`, `seed:fleet`, `check:fleet-gaps`,
`ingest:facts`, `record:route-fixtures` — see "Data pipeline".

## Data pipeline (what writes what)

```
Wikidata ──seed:fleet──► public/data/fleet-registry.json          (+ scripts/fleet-overrides.json corrections)
registry + structured deck/cabin facts ──ingest:facts──► src/data/ships/<id>/manifest.json   (schema-validated)

manifests ► src/utils/shipGenerator.js ► per-class generators (src/data/classes/*) ┐
hand-built Xcel decks (src/data/celebrityXcelData.js) ────────────────────────────┤
scripts/venue-entrances.mjs + scripts/routing-graph.mjs ──────────────────────────┴─ export:packs ─►
        public/v1/ships/index.json + public/v1/ships/<id>/plan.json ──► GitHub Pages ──► Gangway

router + layout ──record:route-fixtures──► public/v1/ships/<id>/route-fixtures.json   (currently Xcel only)
```

- **Generated files — never hand-edit:** `public/v1/**`, `public/data/fleet-registry.json`,
  `src/data/ships/*/manifest.json`. Scripts write them with `JSON.stringify(x, null, 2)`, so they are
  excluded from Prettier. Re-run the script instead.
- **`route-fixtures.json` is recorded on purpose, not regenerated on every export.** It is the routing
  contract with Gangway's TypeScript port (`shipRouting.ts` there ↔ `src/utils/shipRouter.js` here), so a
  routing/layout change should fail a test rather than silently change the file. Re-record with
  `npm run record:route-fixtures` and **say why in the PR**.
- The fleet registry refreshes itself weekly (see CI). The seeder refuses a refresh that looks broken
  (sudden drop in ships); a genuine large change needs the workflow's `allow_large_change` input.
- Where things live: viewer UI in `src/components/`; ship data/generators in `src/data/` (per-class files in
  `src/data/classes/`: Edge, Solstice, Millennium); router and wayfinding in `src/utils/shipRouter.js` and
  `wayfinding.js`; IMO check-digit validation in `src/utils/imo.js`.

## Rules that matter

- **The geometry is synthetic** — a programmatic CAD grid, not a trace of any cruise line's copyrighted
  deck plan. That is what makes the data MIT-licensable. Never commit traced or copied official plans.
  Celebrity's official SVGs may be saved by hand into the git-ignored `.official-deck-plans/` for
  `scripts/official-deck-svg.mjs` to read; **only facts** (names, deck, zone, stateroom numbers) may leave
  it. Packs carry an `attribution` string that consumers must display.
- **Packs are a public contract.** `specVersion` is `1`; new optional fields don't change it, consumers
  must ignore unknown fields. Pack/export scripts are tested in `scripts/*.test.mjs` — keep them green.
- **Some UI is illustrative, not data.** The "Multi-Source Consensus" panel
  (`src/utils/multiSourceDataConsensus.js`) is a hardcoded list of sources with trust scores and made-up
  sync dates — there is no AIS, satellite or Real-ESRGAN ingestion anywhere in the repo, and the "AI Upscale"
  button is only a display toggle. `ApiInspectorModal` shows a `mockGeoJson`. That panel used to cite IMO
  9938430, which **fails the IMO check digit**; it now uses Celebrity Xcel's real `9884136`, and a test keeps
  every IMO in it valid. Don't quote accuracy percentages from those components.
- **Generated or machine-specific folders:** `.claude/worktrees/` (agent checkouts) is ignored by git,
  eslint and prettier; don't edit inside it.

## CI and what a merge to `main` does

All workflows run on GitHub-hosted runners (the repo is public).

| Workflow            | Trigger                                                              | Effect                                                                                                         |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ci.yml`            | PRs and push to `main`                                               | lint → format check → tests with coverage → build → bundle-size budget                                         |
| `deploy.yml`        | after a **successful `ci.yml` run on a push to `main`**, or manually | builds and **publishes the site and the pack JSON to GitHub Pages** — a merge ships to Gangway's data source   |
| `codeql.yml`        | PRs, push to `main`, Mondays 06:00 UTC                               | CodeQL; fails on findings                                                                                      |
| `refresh-fleet.yml` | Mondays 05:00 UTC, manual                                            | re-seeds the registry from Wikidata and opens a PR (via a GitHub App token, otherwise its checks stay pending) |
| `fleet-gaps.yml`    | Tuesdays 05:00 UTC, manual                                           | compares the registry with Wikipedia and updates tracking issue #49                                            |

Dependabot opens grouped dependency PRs. Open work: #55 (muster-station features, no-lifts route option)
and #49 (fleet gaps); the roadmap doc above tracks the rest.

## Conventions

- Prettier + ESLint are enforced in CI — run `npm run format:check` and `npm run lint` before pushing.
- Tests live beside the code (`*.test.js[x]`); `src/test/packFetch.js` serves `public/` from disk so tests
  exercise the same packs a browser downloads.
- Feature branches + PRs to `main`; merge commits (`Merge pull request #…`).
