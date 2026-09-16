# Ship Map Pack v1

Static JSON for trip planners, built by `npm run export:packs`
([`scripts/export-ship-packs.mjs`](../../scripts/export-ship-packs.mjs)) from the deck data in
`src/data`. Published on GitHub Pages:

- `v1/ships/index.json`: the catalog, one small row per ship.
- `v1/ships/<shipId>/plan.json`: one ship's decks and features.

The geometry is synthetic, not a copy of any official deck plan. Consumers must show the
`attribution` string.

`specVersion` is `1`. New optional fields don't change it. A consumer must ignore fields it
doesn't know, and must treat every optional field as possibly absent.

## Pack

| Field | Notes |
| --- | --- |
| `specVersion`, `shipId`, `shipName`, `cruiseLine`, `imoNumber` | Identity. |
| `license`, `attribution`, `sourceUrl` | Provenance. `attribution` must be displayed. |
| `geometry` | `units: "meters"`, `orientation`, and a pack-wide `extent` that every deck normalizes against. |
| `decks[]` | Ascending `deckNumber`. Numbers are not contiguous (no Deck 13). |
| `positionConfidenceDefaults` | Optional. Per-`featureType` fallback for `positionConfidence`, e.g. `{ "cabin": "estimated" }`. See [position confidence](./ship_map_pack_position_confidence.md). |
| `revision`, `updatedAt` | `revision` is a content hash, so re-exporting unchanged data keeps it. |

## Feature (`decks[].features[]`)

| Field | Notes |
| --- | --- |
| `id`, `name` | `id` is stable. Names can repeat for generated space ("Crew Service Area"). |
| `featureType` | `venue`, `poi`, `cabin`, `corridor`, `stairwell`, `elevator` or `muster_station`. Crew and back-of-house space is `corridor`: draw it, never list it. |
| `category`, `description`, `tags`, `color` | Source labels. `color` is advisory. |
| `bounds`, `center` | Metres, in the pack's coordinate space. |
| `cabin` | Cabins only: `number`, `type`, `side`, `accessible`, sizes. |
| `aliases` | Optional `string[]`. Other names guests and daily programs use, e.g. `"OVC"` for Oceanview Café or `"The Theater"` for The Theatre. Includes accent-free spellings (`"Oceanview Cafe"`). Only on `venue` and `poi`. |
| `spansDecks` | Optional `number[]`, ascending. Every deck a multi-deck venue occupies, set on **each** of its per-deck features, so any level leads to the whole span. Always includes the feature's own deck. |
| `positionConfidence` | Optional `"verified"`, `"zone"` or `"estimated"`: how far to trust where the feature is drawn. Omitted when it equals the pack default for its type. See [position confidence](./ship_map_pack_position_confidence.md). |
| `entrances` | Optional `[[x, y], …]`, metres in pack coordinates. Doors of large venues, on corridor-facing edges; route to the nearest one and keep the pin at `center`. Only on `venue`. See [venue entrances](./ship_map_pack_entrances.md). |

An empty `aliases` or `spansDecks` is omitted, never emitted as `[]`.

### Multi-deck venues

Each level of a multi-deck venue is its own feature, with its own footprint on its deck.
For example, The Theatre is `The Theatre` (Deck 3), `The Theatre (Middle Level)` (4) and
`The Theatre (Upper Level)` (5). All three carry `spansDecks: [3, 4, 5]` and the same aliases.
The levels that aren't named plainly "The Theatre" also carry `"The Theatre"` as an alias.

To resolve free text to a venue, match `name` and `aliases`. Collect every feature that shares
the matched alias and span, then pick a level, e.g. the one nearest the guest.

Aliases are unique within a ship. An alias never equals another venue's name or alias,
ignoring case and accents. The only exception is levels of the same venue, which share them.
The exporter tests enforce this.
