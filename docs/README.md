# Cruise Ship Maps docs — index

Start with [`../CLAUDE.md`](../CLAUDE.md) (commands, data pipeline, rules). Some docs here are **early design
blueprints that were never built** — the tables below say which are real. If a doc disagrees with the code,
the code wins.

## Implemented — the contract and the workflows (keep these current)

| Doc                                                                                                                  | Read it when…                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture/ship_map_pack.md](architecture/ship_map_pack.md)                                                       | you touch the published JSON (`public/v1/ships/…`): `specVersion`, `attribution`, aliases, `spansDecks`                                        |
| [architecture/ship_map_pack_routing.md](architecture/ship_map_pack_routing.md)                                       | you touch the routing graph or `routeToNearest`, or the recorded route fixtures                                                                |
| [architecture/ship_map_pack_hours.md](architecture/ship_map_pack_hours.md)                                           | you touch venue hours and booking facts                                                                                                        |
| [architecture/ship_map_pack_entrances.md](architecture/ship_map_pack_entrances.md)                                   | you touch venue entrances                                                                                                                      |
| [architecture/ship_map_pack_position_confidence.md](architecture/ship_map_pack_position_confidence.md)               | you touch `positionConfidence`                                                                                                                 |
| [research/fleet_registry_seeding.md](research/fleet_registry_seeding.md)                                             | you seed, correct or extend the Wikidata-backed fleet registry                                                                                 |
| [research/official_deck_plan_svgs.md](research/official_deck_plan_svgs.md)                                           | you check packs against Celebrity's official SVGs (and the ground rules for using them)                                                        |
| [roadmap/auratrip_integration_onboard_wayfinding.md](roadmap/auratrip_integration_onboard_wayfinding.md)             | you want the two-repo roadmap with Gangway. Phases 0, 2–5 shipped; phase 1 half done; phase 7 shipped except P7.4 (muster stations, issue #55) |
| [design/design_guide.md](design/design_guide.md), [design/deck_plan_viewer_spec.md](design/deck_plan_viewer_spec.md) | you change the viewer's look and controls (tokens, palette, LOD, drawers)                                                                      |

## Blueprints — design intent, not what exists

Each of these carries a "Reality check" banner at the top.

| Doc                                                                                                | What is and isn't real                                                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [architecture/system_architecture_and_scaling.md](architecture/system_architecture_and_scaling.md) | **Never built.** No Turborepo, PostGIS, server or REST API. The static pack is the real "API" |
| [scrum/agile_framework_and_backlog.md](scrum/agile_framework_and_backlog.md)                       | Planning blueprint, not the live process; GitHub issues are                                   |
| [research/deck_plan_formats_and_upscaling.md](research/deck_plan_formats_and_upscaling.md)         | Research only. No AI upscaling pipeline exists                                                |
| [research/cruise_taxonomy_and_data_sources.md](research/cruise_taxonomy_and_data_sources.md)       | Partly implemented (the fleet registry); scraping, AIS and crowdsourcing are not              |

## Audits and review records (historical snapshots)

| Doc                                                                                | Note                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| [qa/qa_peer_review.md](qa/qa_peer_review.md)                                       | QA and accessibility audit, 2026-08-08          |
| [design/design_peer_review.md](design/design_peer_review.md)                       | Design engineering audit                        |
| [design/design_update_recommendations.md](design/design_update_recommendations.md) | Status of the review-driven viewer improvements |

## Related repo

The consumer of these packs is the Gangway app, repo [`big-trip-planner`](https://github.com/doomstar288/big-trip-planner)
(formerly called **AuraTrip**). Its side of the contract is `docs/SHIP_MAP_SERVICE_INTERFACE.md` there.
