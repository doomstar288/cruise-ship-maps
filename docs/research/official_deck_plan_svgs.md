# Checking packs against Celebrity's official deck plan SVGs

Celebrity publishes each ship's deck plans on celebritycruises.com as one SVG per deck, e.g.

```
https://www.celebritycruises.com/content/dam/rcg/cel/resources/deck-plans/ship/celebrity-xcel/2331/decks/deck-fourteen.svg
```

(`2331` is the ship's plan profile; Celebrity Edge's is `2363`.) These are the most accurate
public source for which deck and which end of the ship a venue is on, and for the real
stateroom numbers. The Celebrity app's deck maps very likely draw on the same plans.

`scripts/official-deck-svg.mjs` reads those SVGs and checks the published pack against them.

## Ground rules

- **Save the SVGs by hand** in a browser, one per deck, into `.official-deck-plans/<shipId>/`
  (git-ignored). Royal Caribbean Group's
  [digital terms](https://www.royalcaribbean.com/terms-and-conditions/digital-terms-of-use-and-end-user-license-agreement)
  forbid "any robot, spider or other automatic device" on its sites, so nothing here downloads them.
- **Never commit the SVGs or anything traced from them.** The same terms forbid reproducing or
  making derivative works of their content. Packs keep their synthetic geometry. Only facts move
  across: a venue's name, deck, fore/aft zone and side, and stateroom numbers.
- **Don't take the data from the Celebrity app.** Getting at it means intercepting the app's
  traffic or unpacking the app, which is off the table. Use the app onboard to check results by eye.

## Running it

```bash
npm run check:official-plans -- --ship-id celebrity-xcel          # report against the pack
npm run check:official-plans -- --ship-id celebrity-xcel --json   # same, as JSON
npm run check:official-plans -- --ship-id celebrity-xcel --write  # also save the facts
```

File names can be Celebrity's own (`deck-fourteen.svg`) or numeric (`deck-14.svg`). `--dir`
reads from another folder.

The report lists:

- venues on a different deck in the pack, or in a different fore/aft zone;
- official names the pack doesn't have, under any name or alias;
- matches the pack doesn't mark `verified` yet, which are candidates for `positionConfidence: 'verified'`
  in the deck generator, with an official-plan citation like the existing ones;
- per deck and side, stateroom numbers missing from the pack and pack numbers not on the plan.

`--write` saves the facts to `src/data/ships/<shipId>/official-facts.json`. Commit that file:
it holds no geometry, only names, decks, zones, sides, a 0–1 bow-to-stern position (hundredths
for venues, thousandths for staterooms), and each stateroom's number, side and row (`outside` on
the hull, `inside` one corridor in).

Applying the findings is a normal code change: fix decks and zones, set `verified` in the generator,
then `npm run export:packs` and `npm run record:route-fixtures`.

Xcel's generator reads the stateroom facts directly: `officialCabins()` turns each one into a
`placed` cabin for `generateStaterooms`, which draws one cabin of the generator's type at that
spot (position × ship length). Cabins labelled at one spot are spread apart, inside cabins step
out of lift lobbies, inside cabins where the bow is too narrow join the hull row, and a deep
suite keeps to a standard depth beside a lobby or an inside cabin. So every number on Celebrity's
plan is in the pack, on the right side and in order, while the shapes stay synthetic.

## How it reads a plan

- **Labels**: every `<text>` element, with ancestor `transform`s applied. Lines split over
  `<tspan>`s become one label. If the labels are drawn as outlines (no `<text>`), the script
  stops and says so. Those plans would need OCR, which this doesn't do.
- **Stacked names**: Celebrity sets many names as separate `<text>` lines ("THE" / "POOL" /
  "CLUB", "IL SECONDO" / "BACIO"). Venue labels that read the same way, sit one line apart
  (0.6–1.3 font sizes) and overlap along the line by at least a quarter of the shorter one
  are joined, top line first. Text sized only by a stylesheet takes the plan's typical
  label size. Dense spots can still join two neighbouring names, so read the "not in the
  pack" list with the plan open.
- **Kinds**: 4–5 digit numbers starting with the deck number are staterooms. Labels naming
  elevators, lifts or stairs are circulation, and GENTS / LADIES / WC are restrooms, which
  are skipped because the pack names them generically. Other text with a word in it is a venue.
- **Orientation**: Celebrity numbers staterooms upward from bow to stern, odd to port. The
  script reads which way the drawings face from that, across all decks, including which
  axis the ship runs along. Celebrity draws the ship upright, bow at the top and port on
  the left. `--bow` and `--port` (each `left`, `right`, `top` or `bottom`) override it.
- **Extent**: Celebrity cuts every deck from one drawing with the decks side by side, so
  the decks line up along the ship (the lift banks sit at the same place on every deck).
  The ship's length is the union of all the decks' viewBoxes along the ship, and each
  deck's beam is its own viewBox across it. Without viewBoxes, the spread of all labels
  stands in. On Xcel the two official lift banks land at 0.29 and 0.62 of the length,
  against 0.27 and 0.59 for the pack's forward and midship banks.
- **Zones**: fore/aft thirds of the hull, with a 4% slack at each boundary. Side is by
  thirds of the beam. Side is reported but doesn't decide a match, because pack sides are
  often synthetic.
- **Names**: matched case-, accent- and punctuation-insensitively, ignoring "The" and
  treating "&" as "and". A multi-word official name also matches a pack name that extends it
  word by word, so "Mast Grill" matches "Mast Grill & Bar".
