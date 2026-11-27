# 🚢 Cruise Ship Maps & Open Deck Plan API Platform

An open-source cruise ship deck map viewer, and the producer of static, versioned **Ship Map Pack** JSON for travel applications and trip planners. Prototype vessel: **Celebrity Xcel** (Edge-Class flagship); packs are published for 14 Celebrity ships. There is no backend: the "API" is static files under `public/v1/`.

---

## 🌟 Key Features

- **All 15 Guest Decks**: Interactive vector maps of _Celebrity Xcel_'s guest decks (2–12 and 14–17), drawn to the real 327 m × 39 m proportions with venues on their published decks and fore/aft zones.
- **Programmatic Deck Grid Engine**: Metre-scale hull envelopes per deck, non-overlapping stateroom rows and corridors, hull boundary clamping, and bow-to-stern cabin numbering. Layouts are synthetic approximations, not traced official plans.
- **Multi-Source Consensus panel (illustrative)**: a UI mock-up of how floorplan, AIS and crowdsourced sources could be cross-referenced. Its sources and scores are hardcoded; no AIS, satellite or AI-upscaling ingestion exists in this repo.
- **Static Ship Map Packs & GeoJSON download**: versioned JSON (`public/v1/ships/index.json` and per-ship `plan.json`, see [Ship Map Pack v1](./docs/architecture/ship_map_pack.md)) published on GitHub Pages, plus a per-deck `.geojson` download in the viewer. The OpenAPI/REST design in `docs/architecture/system_architecture_and_scaling.md` is a blueprint, not a running service.
- **Turn-by-Turn Wayfinding & Routing**: Multi-deck routes over the published pack's routing graph (walks, lifts and stairs, with a step-free option), drawn as animated paths with turn-by-turn guidance.
- **Accessible UI & Design System**: Custom HSL dark mode theme, 44px minimum touch targets, desktop right slide-over inspector drawers, and WAI-ARIA accessibility.

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/doomstar288/cruise-ship-maps.git
cd cruise-ship-maps

# Install dependencies (Node 24, see .nvmrc)
npm install

# Start local development server
npm run dev
```

Open [http://localhost:8766](http://localhost:8766) in your browser. Run `npm test`, `npm run lint` and `npm run format:check` before opening a PR. Contributors and AI agents: start with [CLAUDE.md](./CLAUDE.md).

---

## 📚 Project Documentation

- [`docs/design/design_guide.md`](./docs/design/design_guide.md): Design tokens, HSL color palette, typography scale, and glassmorphism specs.
- [`docs/design/deck_plan_viewer_spec.md`](./docs/design/deck_plan_viewer_spec.md): Interactive map controls, LOD thresholds, and mobile drawer specs.
- [`docs/architecture/ship_map_pack.md`](./docs/architecture/ship_map_pack.md): Ship Map Pack v1, the static JSON trip planners consume, including feature `aliases` and `spansDecks`, how this app fetches packs rather than bundling them, and the app bundle size budget.
- [`docs/research/official_deck_plan_svgs.md`](./docs/research/official_deck_plan_svgs.md): Checking packs against Celebrity's official deck plan SVGs, and the ground rules for using them.
- [`docs/architecture/system_architecture_and_scaling.md`](./docs/architecture/system_architecture_and_scaling.md): PostGIS DDL schema, Cruise Deck GeoJSON extension, and OpenAPI 3.1 REST API specification.
- [`docs/scrum/agile_framework_and_backlog.md`](./docs/scrum/agile_framework_and_backlog.md): Open-source dual-track Scrum framework and Epic user stories.
- [`docs/qa/qa_peer_review.md`](./docs/qa/qa_peer_review.md): QA & accessibility peer review audit report.
- [`docs/design/design_peer_review.md`](./docs/design/design_peer_review.md): Design engineering audit report.

---

## 📄 License

MIT License. Open-source data for trip planning applications and the global cruise enthusiast community.
