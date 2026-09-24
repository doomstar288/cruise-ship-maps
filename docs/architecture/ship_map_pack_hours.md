# Ship Map Pack v1: hours and booking facts

When a venue is usually open, whether guests book it ahead, what the food costs and the usual
dress code. The four fields are optional and additive, so `specVersion` stays `1`.

**These are typical facts, not today's.** Hours change with the itinerary and between sea and
port days, and the ship's daily program always wins. Say "usually" in the UI.

This is the detail doc for the fields. The pack format as a whole is in
[`ship_map_pack.md`](./ship_map_pack.md).

## Fields

All four appear only on `venue` and `poi` features. A missing field means "not known". It
doesn't mean "closed" or "walk in".

| Field | Type | Meaning |
| --- | --- | --- |
| `hours` | `[[open, close], …]` | Typical opening windows, in ship's time. Format below. |
| `reservationRequired` | boolean | `true`: normally booked ahead, e.g. a specialty restaurant or a seating. A walk-in may still get a table when there's room. `false`: guests normally walk in, even where bookings are taken, as in the main restaurants. |
| `fee` | `"included"`, `"surcharge"` or `"a la carte"` | What the food costs a guest who may use the venue (`access` says who may): in the fare, a cover charge per person, or priced per item. Drinks are extra either way. |
| `dressCode` | `"casual"` or `"smart casual"` | The venue's usual code. The program's attire for the evening, e.g. Evening Chic, wins. |

A consumer should ignore a `fee` or `dressCode` value it doesn't know.

## The window format

Times are 24-hour `"HH:MM"` strings in ship's time, from `"00:00"` to `"23:59"`, plus `"24:00"`.

```json
"hours": [["07:30", "09:00"], ["12:00", "13:30"], ["17:30", "21:00"]]
"hours": [["09:00", "01:00"]]
"hours": [["06:30", "24:00"]]
"hours": [["00:00", "24:00"]]
```

- **Order.** Windows are in opening order and never overlap or touch. Touching windows are
  written as one.
- **Past midnight.** A window whose close is earlier than its open runs past midnight, like
  `["09:00", "01:00"]` above. Only the last window may, and it must close before the first
  one opens.
- **Midnight.** A close at midnight is `"24:00"`, never `"00:00"`. `"24:00"` never opens a
  window.
- **All day.** `[["00:00", "24:00"]]` is open around the clock.

Both ends count as open, so an agenda item at the closing time isn't flagged. To test a time
`t` in minutes after midnight:

```js
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const inWindow = (t, [open, close]) =>
  minutes(close) < minutes(open) ? t >= minutes(open) || t <= minutes(close) : t >= minutes(open) && t <= minutes(close);
const usuallyOpen = (t, hours) => hours.some((window) => inWindow(t, window));
```

The exporter rejects anything else. `hoursFor` in
[`scripts/export-ship-packs.mjs`](../../scripts/export-ship-packs.mjs) has the rules, and
`scripts/export-ship-packs.test.mjs` has an example of each malformed case.

## What "typical" means

For a ship, `hours` is the union of the windows its printed daily program gave the venue on
the regular sea and port days of one sailing. Embarkation and disembarkation days are left out.
So a time outside every window is one when the venue is usually closed. A time inside a window
is no promise it's open today: some services run on sea days only, like the main-restaurant
lunch in Cosmopolitan.

Not recorded:

- Venues the program says close "Late" (bars, The Club, the Casino): there's no closing time.
- Hours that cover only part of a venue, like an art gallery's staffed hours.
- Anything no source covers. Such a venue has no facts.

## What's published

Only Celebrity Xcel has these facts so far. Its hours come from the "Dine & Drink" and
"Opening Hours" pages of Celebrity Today for the 4–11 January 2026 sailing (three sea days,
three port days). The booking facts come from the same program, Celebrity's venue pages and
FAQs, and reviews. The pull request for P7.2 cites a source for every fact.

Every Xcel dining venue has `hours` and `reservationRequired` except Grand Plaza Café, which no
Xcel source mentions. Another ship gets these facts only from a source for that ship or its
class; Xcel's hours are never copied to a sister ship. The exporter tests hold both rules.

In the producer, the facts sit on the venue records in
`src/data/celebrityXcelFullDeckGenerator.js`, next to `access`.

## Consuming them

- Say "usually" or "typical", and point to the day's program.
- When the day's imported program gives times for a venue, use those and don't warn from
  `hours` that day.
- Drop a malformed window on its own and keep the rest; treat a venue left with no windows as
  having no hours.
