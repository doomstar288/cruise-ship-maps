# 🚢 Cruise Ship Maps & Open Deck Plan API Platform

An open-source, high-accuracy cruise ship deck map viewer, spatial database schema, and REST API platform for travel applications and trip planners. Prototype vessel: **Celebrity Xcel** (Edge-Class flagship).

---

## 🌟 Key Features

- **All 15 Guest Decks**: Interactive vector maps of *Celebrity Xcel*'s guest decks (2–12 and 14–17), drawn to the real 327 m × 39 m proportions with venues on their published decks and fore/aft zones.
- **Programmatic Deck Grid Engine**: Metre-scale hull envelopes per deck, non-overlapping stateroom rows and corridors, hull boundary clamping, and bow-to-stern cabin numbering. Layouts are synthetic approximations, not traced official plans.
- **Multi-Source Accuracy Consensus Engine**: Cross-references official floorplan vectors, satellite AIS telemetry (IMO 9938430), AI super-resolution (Real-ESRGAN), and crowdsourced logs to guarantee 98.4%+ spatial accuracy.
- **OpenAPI 3.1 & GeoJSON Download**: Export full deck vector geometries and venue metadata directly as standardized `.geojson` files for external trip planning applications.
- **Turn-by-Turn Wayfinding & Routing**: Preset wayfinding routes with animated marching-ant paths and turn-by-turn guidance.
- **Accessible UI & Design System**: Custom HSL dark mode theme, 44px minimum touch targets, desktop right slide-over inspector drawers, and WAI-ARIA accessibility.

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/doomstar288/cruise-ship-maps.git
cd cruise-ship-maps

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open [http://localhost:8765](http://localhost:8765) in your browser.

---

## 📚 Project Documentation

- [`docs/design/design_guide.md`](./docs/design/design_guide.md): Design tokens, HSL color palette, typography scale, and glassmorphism specs.
- [`docs/design/deck_plan_viewer_spec.md`](./docs/design/deck_plan_viewer_spec.md): Interactive map controls, LOD thresholds, and mobile drawer specs.
- [`docs/architecture/ship_map_pack.md`](./docs/architecture/ship_map_pack.md): Ship Map Pack v1, the static JSON trip planners consume, including feature `aliases` and `spansDecks`.
- [`docs/architecture/system_architecture_and_scaling.md`](./docs/architecture/system_architecture_and_scaling.md): PostGIS DDL schema, Cruise Deck GeoJSON extension, and OpenAPI 3.1 REST API specification.
- [`docs/scrum/agile_framework_and_backlog.md`](./docs/scrum/agile_framework_and_backlog.md): Open-source dual-track Scrum framework and Epic user stories.
- [`docs/qa/qa_peer_review.md`](./docs/qa/qa_peer_review.md): QA & accessibility peer review audit report.
- [`docs/design/design_peer_review.md`](./docs/design/design_peer_review.md): Design engineering audit report.

---

## 📄 License

MIT License. Open-source data for trip planning applications and the global cruise enthusiast community.
