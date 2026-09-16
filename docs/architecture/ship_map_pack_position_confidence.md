# Ship Map Pack v1: `positionConfidence`

How far a consumer can trust where a feature is drawn. It's an optional, additive field, so
`specVersion` stays `1`. Use it to soften the UI, e.g. show "near midship" or "Approximate"
instead of a precise pin.

This is a self-contained section of the pack format, kept in its own file so it can be folded
into the main pack format doc without conflicts.

## Values

| Value | Meaning |
| --- | --- |
| `verified` | Deck, fore/aft zone **and side** checked against an authoritative plan. Nothing is `verified` yet (P1.1). |
| `zone` | Deck and fore/aft zone are reliable. The exact spot and side are not. |
| `estimated` | Deck or zone is uncertain or conflicting, or the geometry is synthetic. |

A consumer must treat an unknown value as `estimated`.

## Where it appears

| Location | Field | Notes |
| --- | --- | --- |
| Pack | `positionConfidenceDefaults` | Object keyed by `featureType`. Today `{ "cabin": "estimated" }`. |
| Feature | `positionConfidence` | Omitted when it equals the pack default for the feature's type. |

Resolve a feature's confidence like this:

```js
const confidence = feature.positionConfidence ?? pack.positionConfidenceDefaults?.[feature.featureType];
```

If `confidence` is still undefined, the pack makes no claim. Only `corridor` features have no
claim today, because they're circulation and never a destination.

## What gets which value

| `featureType` | Value | Why |
| --- | --- | --- |
| `venue`, `poi`, `muster_station` | `zone`, or `estimated` where authored | Always on the feature. |
| `elevator`, `stairwell` | `estimated` | Routing targets on a synthetic grid. Always on the feature. |
| `cabin` | `estimated`, via the pack default | Cabin numbering is synthetic (P1.2). |
| `corridor` | none | Not a destination. |

In the producer, confidence is a fact on the source venue record in
`src/data/celebrityXcelFullDeckGenerator.js`. A venue is `estimated` when sources conflict on its
deck, no published source places it, or Celebrity's own plan labels it in a different fore/aft
zone than drawn. Each one has its reason written next to it. Records that set nothing get the
exporter's per-type default. The exporter rejects any value outside the three above.
