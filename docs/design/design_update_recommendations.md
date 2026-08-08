# Design Update Recommendations

Status of the review-driven improvements to the Celebrity Xcel deck-plan viewer.
Items marked **✅ Shipped** are included in this PR; the rest are the recommended
roadmap.

---

## 1. Map viewer — runtime correctness

### ✅ Fit-to-bounds is computed, not hardcoded
The viewer previously fit every deck to a fixed box (`[[-10,-10],[110,337]]`),
so decks with different extents (and the Magic Carpet, which cantilevers past
the hull) never framed correctly, and content hid under the floating overlays.

**Change:** bounds are now derived from the features actually drawn
(`L.featureGroup(...).getBounds()`), and the fit uses **asymmetric padding**
(`paddingTopLeft` / `paddingBottomRight`) so the deck is never tucked under the
deck switcher, toolbar, or status bar. The map also seeds an initial view on
creation so it is never left blank before the first fit.

### ✅ Geometry and labels render independently (performance)
The single render effect listed `currentZoom` in its dependencies, so **every
pan/zoom cleared and rebuilt every polygon** — expensive on stateroom decks with
hundreds of cabins.

**Change:** geometry (hull + venue polygons) lives in one layer group that
redraws only on deck/filter/selection changes; labels live in a separate layer
group that redraws on zoom for LOD thinning and collision recompute. Panning no
longer rebuilds geometry.

### ✅ Label pills are legible
Pills collapsed to just their colour dot because the flex pill had no definite
width inside Leaflet's zero-size marker. Added `width: max-content` (capped by
the existing `max-width`) so the venue name renders.

### ✅ StrictMode teardown race fixed
A `requestAnimationFrame`-deferred fit could fire against a map that React's
StrictMode had already torn down, throwing `_leaflet_pos`. Deferred map
operations now no-op unless the map is still the current instance.

---

## 2. Data & filtering

### ✅ Venue taxonomy normalized
The dataset uses ~20 free-form `category` strings while the filter chips compared
against a handful of exact keys, so filters silently dropped venues (e.g.
"Dining & Nightlife", "Pools & Recreation"). A new `src/utils/venueTaxonomy.js`
maps any category onto the canonical filter keys via keyword matching and drives
both filtering and label priority. Covered by unit tests.

### ◻️ Emit GeoJSON as the canonical format (recommended)
Model decks/venues as GeoJSON `FeatureCollection`s. It is the standard
interchange format (feeds Leaflet, MapLibre, and deck.gl unchanged), and it makes
the existing "Open API GeoJSON" affordance real rather than decorative. Validate
with a schema (e.g. `zod`).

---

## 3. Integrity of presented data

### ✅ Simulated features labelled
The "98.4% verified accuracy", "Real-ESRGAN 4x upscale", "AIS satellite" and
"multi-source consensus" features are hardcoded mocks. Added clear
"simulated / prototype data" disclaimers to the accuracy sidebar card and the
Multi-Source inspector modal so the demo does not present fiction as fact.

### ◻️ Decide: build or clearly gate (recommended)
Either implement one of these pipelines for real, or keep them behind an obvious
"demo" treatment. Do not ship them as literal claims.

---

## 4. Engineering quality (tooling)

### ✅ ESLint + Prettier
Flat-config ESLint (`eslint.config.js`) with the React and React-Hooks plugins,
replacing the placeholder `"lint": "vite build"` script. Prettier config added
for consistent formatting (`npm run format`).

### ✅ Vitest test suite
`vitest.config.js` (jsdom, globals, coverage) plus unit tests for the taxonomy
helpers and dataset invariants (13 tests). Wired into CI.

### ◻️ TypeScript migration (recommended, larger)
`@types/*` are already installed but nothing is typed. Migrating `.jsx → .tsx`
would catch the class of bug this review found (mismatched category keys) at
compile time.

---

## 5. Architecture roadmap (beyond this PR)

- **Re-platform the map on MapLibre GL JS.** WebGL rendering, native zoom-based
  LOD, and built-in label collision would replace the hand-rolled collision
  engine and scale to full stateroom density at 60fps. `deck.gl` is the
  alternative if a more data-driven layer model is preferred.
- **Extract inline styles.** Large inline style objects are mixed with the CSS
  file; consolidate into the design system for consistency and theming.
- **Make wayfinding real.** Routing currently returns a fixed sample route and
  draws a stub line; compute actual paths between venues/decks.
- **Multi-ship data model.** The "platform" framing implies more than one hard
  coded vessel; structure data and routing to load ships dynamically.

---

## CI/CD (this PR)

- **CI** (`.github/workflows/ci.yml`): lint → test (coverage) → build on every
  push and PR to `main`, with the build uploaded as an artifact.
- **Deploy** (`.github/workflows/deploy.yml`): builds and publishes to GitHub
  Pages after CI passes on `main`. Vite `base: './'` makes the SPA work under the
  project subpath. _One-time setup: repo Settings → Pages → Source: GitHub
  Actions._
- **CodeQL** (`.github/workflows/codeql.yml`): security analysis on push, PR, and
  weekly schedule.
- **Dependabot** (`.github/dependabot.yml`): grouped weekly npm and Actions
  updates.
