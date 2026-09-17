# Ship Map Pack v1: venue `entrances`

Roadmap task P1.4. An optional feature field, added without a `specVersion` bump. Consumers
that don't know it ignore it.

```jsonc
{
  "id": "v3-theatre",
  "featureType": "venue",
  "bounds": [[24, 8.81], [78, 30.19]],
  "center": [51, 19.5],
  "entrances": [[78, 14.37], [78, 24.75]]
}
```

| Field | Notes |
| --- | --- |
| `entrances` | Optional `[[x, y], …]` in pack coordinates (metres, same space as `bounds` and `center`, rounded to 2 dp). Doors of a large venue. Only on `venue` features. Omitted, never `[]`, when a feature has none. |

**How to use it.** Route to the **nearest entrance**, not to `center`. Big rooms have doors,
not middles, so a walk that ends at the centre of The Theatre overstates or misplaces the
route. Keep the map pin at `center`.

**Provenance.** Entrances are synthetic. They are derived from this repo's synthetic layout
and are not facts from an official deck plan. Venue side of ship is still unverified (P1.1).

## Which venues

`scripts/venue-entrances.mjs`, `isLargeVenue`:

- `featureType: "venue"` and not atrium circulation (tag `Atrium`, i.e. the Grand Plaza levels), and
- footprint area of at least **800 m²**, **or** on the explicit include list: The Theatre (3, 4, 5),
  Normandie, Tuscan, Cosmopolitan, Cyprus, Mosaic at The Bazaar, Market at The Bazaar,
  Spice Café, The Bazaar (Upper Level), Celebrity Pool Club and Oceanview Café.

The Grand Plaza is modelled as an open atrium. Guests walk through it, so it has no doors of its
own, and neighbouring venues can open onto it.

## Where the doors go

On public decks the walkways aren't features. They are the gaps the generator leaves between
rectangles:

- the 2 m cross-passages either side of each elevator core and between venue blocks
- the stateroom corridors
- the elevator lobbies, stairwells and the atrium

`corridor` features are crew space, not walkways.

Each venue edge is sampled every 0.25 m, and a ray is cast outward from each sample. A sample is
corridor-facing when the ray does one of these before it reaches the hull:

- meets an elevator lobby, stairwell or atrium within 20 m
- crosses a free gap 1.5–20 m wide and meets another feature
- runs at least 40 m down a corridor

Edges whose ray reaches the hull first are never used. Neither are edges shared with a neighbour
(seams under 1.5 m), nor points within 1 m of the hull outline.

Corridor-facing samples merge into runs. Seams of 1.5 m or less are bridged. Each run of at least
1.5 m gets a door at its midpoint. A run of 16 m or more gets two doors, at its quarter points.

`ENTRANCE_OVERRIDES` holds hand-authored entrances for venues the geometry can't infer. It is
empty today. The same tests cover overrides.

## Guarantees (producer tests)

`scripts/venue-entrances.test.mjs` asserts, for the published pack:

- every listed or large venue has at least one entrance, and only large venues have them
- every entrance lies on its venue's boundary and is rounded to 2 dp
- stepping outward through each entrance stays inside the hull and outside every non-circulation
  feature for at least 1.4 m. The passage ends at another feature or runs down a corridor, not
  at the hull, and the entrance is at least 1 m from the hull outline.
- no entrance is on or within 0.25 m of a cabin or crew (`corridor`) feature
- `specVersion` is still 1

## Reaching the doors (Phase 2)

Mosaic (Deck 4) and Spice Café (Deck 5) open onto 2 m transverse passages that the synthetic
layout closes at both ends with the hull. Those passages connect to the rest of the deck only
through sub-metre seams. The entrances are still valid corridor edges. The routing graph reaches
them through documented connectors, and doors that open onto walk sections with no lobby are left
off the graph. See [routing](./ship_map_pack_routing.md#connectors).
