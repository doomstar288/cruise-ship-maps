# Cruise Ship Deck Plan & Map Platform
## UI/UX Design System & Style Guide

> **Document Version**: 1.0.0  
> **Status**: Approved Specification  
> **Target Platform**: Desktop Web, Mobile Web, Touch Kiosks, & Embedded App Views  
> **Design Philosophy**: Luxury Nautical Dark Mode, Glassmorphism, Micro-spatial Precision, Accessibility First

---

## 1. Visual Identity & Brand Philosophy

The **Cruise Ship Deck Plan & Map Platform** design system delivers an ultra-premium, modern nautical navigation experience. Drawing inspiration from maritime bridge navigation displays, luxury ocean liners, and high-end aerospace interfaces, the visual language balances **spatial clarity**, **tactile depth**, and **luminous legibility**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      LUXURY NAUTICAL DESIGN SYSTEM                      │
├──────────────────────────┬──────────────────────┬───────────────────────┤
│   Deep Oceanic Depth     │  Luminous Telemetry  │  Frosted Spatial HUD  │
│   #0a111e / HSL(218,50,8)│  Gold & Cyan Accents │  16px Blur Glasswork  │
└──────────────────────────┴──────────────────────┴───────────────────────┘
```

### Core Design Principles

1. **Spatial Clarity Above All**: Deck plans present dense architecture. UI elements float softly over the canvas using layered glassmorphic cards without obscuring navigational geometry.
2. **Nautical Elegance**: Deep oceanic slate and navy backgrounds accented with polished maritime brass/gold (`#e0aa3e`), celestial cyan (`#00e5ff`), and crisp status indicators.
3. **High-Contrast Telemetry**: Amenity badges, deck levels, and cabin categories utilize vibrant, high-contrast HSL color pairs engineered for WCAG 2.1 AA compliance under high or low ambient lighting.
4. **Tactile & Responsive Feedback**: Interactive map elements respond with instant visual feedback—subtle outer halos, elevation lifts, smooth vector path tracing, and micro-haptic cues.

---

## 2. Color Tokens & Theme Palettes

The color system is specified in **CSS Custom Properties** using `hsl()` and `hsla()` format to allow dynamic alpha compositing, visual accessibility adjustments, and dark/light adaptive overrides.

### 2.1 Base & Surface Theme Tokens (Luxury Dark Mode)

```css
:root {
  /* Surface & Base Colors */
  --bg-abyss: hsl(220, 55%, 5%);           /* #050914 - App Background */
  --bg-deep-ocean: hsl(218, 50%, 8%);      /* #0a111e - Canvas Base */
  --bg-surface-dark: hsl(217, 44%, 12%);   /* #111a2d - Card Base */
  --bg-surface-glass: hsla(217, 40%, 15%, 0.65); /* Floating Card Glass */
  --bg-surface-glass-hover: hsla(217, 40%, 20%, 0.80);
  
  /* Borders & Dividers */
  --border-subtle: hsla(215, 30%, 30%, 0.35);
  --border-glass: hsla(215, 50%, 60%, 0.18);
  --border-active-glow: hsla(187, 100%, 50%, 0.60);
  
  /* Text & Typography Colors */
  --text-primary: hsl(210, 40%, 98%);     /* High contrast white-blue */
  --text-secondary: hsl(215, 20%, 75%);   /* Neutral gray-blue */
  --text-muted: hsl(215, 15%, 52%);       /* Low contrast metadata */
  --text-inverse: hsl(220, 55%, 5%);      /* On light badges */

  /* Maritime Brand Accents */
  --accent-gold: hsl(43, 74%, 52%);        /* #e0aa3e - Maritime Gold */
  --accent-gold-hover: hsl(43, 85%, 60%);
  --accent-cyan: hsl(187, 100%, 42%);      /* #00d9f5 - Celestial Cyan */
  --accent-cyan-glow: hsla(187, 100%, 50%, 0.25);
  --accent-emerald: hsl(160, 84%, 39%);   /* #10b981 - Port / Access */
  --accent-crimson: hsl(348, 83%, 47%);   /* #e11d48 - Starboard / Emergency */
  --accent-amber: hsl(38, 92%, 50%);       /* #f59e0b - Caution / Elevator */
  --accent-indigo: hsl(245, 58%, 62%);    /* #7c3aed - VIP / Suites */
}
```

### 2.2 Amenity Category High-Contrast Tokens

Every amenity type on the ship deck has a designated color family to ensure rapid visual scanning.

| Amenity Category | Token Name | Primary HSL Code | Hex Code | High-Contrast Tag Text | Minimum Contrast |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Staterooms & Suites** | `--amenity-stateroom` | `hsl(215, 80%, 65%)` | `#5b96f7` | `#ffffff` on `#1a3b70` | 7.2:1 (AAA) |
| **Fine Dining & Buffets** | `--amenity-dining` | `hsl(25, 95%, 53%)` | `#f97316` | `#ffffff` on `#7c2d12` | 6.8:1 (AAA) |
| **Lounges & Bars** | `--amenity-bar` | `hsl(280, 75%, 60%)` | `#ad46e8` | `#ffffff` on `#581c87` | 7.5:1 (AAA) |
| **Entertainment & Theater**| `--amenity-entertainment`| `hsl(330, 85%, 55%)` | `#ec4899` | `#ffffff` on `#831843` | 7.1:1 (AAA) |
| **Pool Deck & Outdoor** | `--amenity-pool` | `hsl(187, 100%, 42%)` | `#00d9f5` | `#042f2e` on `#00d9f5` | 8.4:1 (AAA) |
| **Spa, Wellness & Gym** | `--amenity-spa` | `hsl(160, 84%, 39%)` | `#10b981` | `#ffffff` on `#064e3b` | 6.4:1 (AA) |
| **Guest Services & Shore** | `--amenity-services` | `hsl(43, 74%, 52%)` | `#e0aa3e` | `#1c1917` on `#e0aa3e` | 9.1:1 (AAA) |
| **Elevators & Medical** | `--amenity-technical` | `hsl(0, 84%, 60%)` | `#ef4444` | `#ffffff` on `#7f1d1d` | 6.9:1 (AAA) |

---

## 3. Typography System

The platform uses a tri-font pairing strategy to establish hierarchical clarity between map UI controls, narrative location details, and precise technical telemetry.

### 3.1 Font Stack Declarations

```css
:root {
  /* Font Families */
  --font-display: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}
```

### 3.2 Typography Scale & Style Matrix

| Style Role | Font Family | Size (px / rem) | Weight | Line Height | Letter Spacing | Usage Context |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Title** | `Outfit` | `32px / 2.0rem` | 700 (Bold) | 1.2 | `-0.02em` | Main Deck Header, Ship Overview Hero |
| **Heading 1 (H1)** | `Outfit` | `24px / 1.5rem` | 600 (SemiBold) | 1.3 | `-0.01em` | Deck Name, Venue Modal Title |
| **Heading 2 (H2)** | `Outfit` | `18px / 1.125rem` | 600 (SemiBold) | 1.4 | `0.00em` | Drawer Section Headers, Category Group |
| **Heading 3 (H3)** | `Outfit` | `15px / 0.9375rem`| 500 (Medium) | 1.4 | `0.01em` | Cabin Category Name, Tooltip Header |
| **Body Large** | `Inter` | `16px / 1.0rem` | 400 (Regular) | 1.5 | `0.00em` | Location Descriptions, Route Guidance |
| **Body Medium** | `Inter` | `14px / 0.875rem` | 400 (Regular) | 1.5 | `0.00em` | General UI Text, Filter Labels |
| **Body Small** | `Inter` | `12px / 0.75rem` | 500 (Medium) | 1.4 | `0.01em` | Badge Text, Sub-labels, Metadata |
| **Micro Tag** | `Inter` | `11px / 0.6875rem`| 700 (Bold) | 1.2 | `0.05em (UPPER)`| Deck Number Pill, State Badges |
| **Code / Telemetry**| `JetBrains Mono`| `13px / 0.8125rem`| 500 (Medium) | 1.4 | `-0.01em` | Cabin #, Lat/Long, API Code Snippets |

---

## 4. Component Design System

### 4.1 Glassmorphism Elevation Specs

Floating UI panels use frosted backdrop filters with multi-layered specular borders to simulate acrylic bridge control surfaces.

```css
/* Surface Elevation Level 1 - Cards & Trays */
.glass-panel-el1 {
  background: var(--bg-surface-glass);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--border-glass);
  box-shadow: 
    0 8px 32px 0 rgba(0, 0, 0, 0.37),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}

/* Surface Elevation Level 2 - Floating Toolbars & Modals */
.glass-panel-el2 {
  background: hsla(217, 45%, 11%, 0.82);
  backdrop-filter: blur(24px) saturate(200%);
  -webkit-backdrop-filter: blur(24px) saturate(200%);
  border: 1px solid hsla(187, 100%, 50%, 0.25);
  box-shadow: 
    0 12px 48px 0 rgba(0, 0, 0, 0.55),
    0 0 20px 0 var(--accent-cyan-glow),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.15);
  border-radius: 20px;
}
```

### 4.2 Deck Switcher Pill Bar Component

The Deck Switcher allows rapid vertical navigation through the ship’s decks (e.g., Deck 01 Riviera up to Deck 18 Sun Deck).

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DECK SWITCHER PILL BAR                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ [ Deck 04 ]  [ Deck 05 ]  [* DECK 06 - LIDO *]  [ Deck 07 ]  [ Deck 08 ] │
│  (Engine)     (Staterooms)  (Active - Gold Glow) (Dining)     (Suites)  │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Component Token & Layout Rules
- **Container**: Floating centered horizontally at top or bottom edge (`z-index: 100`).
- **Pill Item Width**: Auto-fit content with minimum touch target `44px x 44px`.
- **Active State**: Background `hsl(43, 74%, 52%)`, Text `#0a111e` (Bold), box-shadow `0 0 16px hsla(43, 74%, 52%, 0.4)`.
- **Deck Type Indicators**:
  - `Public Deck`: Cyan dot indicator.
  - `VIP Stateroom Deck`: Purple dot indicator.
  - `Restricted / Crew Deck`: Red warning outline badge.

```html
<!-- HTML Structure Example -->
<nav class="deck-switcher-bar glass-panel-el1" aria-label="Deck Selection">
  <button class="deck-pill" data-deck="5">
    <span class="deck-number">05</span>
    <span class="deck-label">Main Dining</span>
  </button>
  <button class="deck-pill active" data-deck="6" aria-current="true">
    <span class="deck-number">06</span>
    <span class="deck-label">Lido & Pool</span>
    <span class="deck-badge public">PUBLIC</span>
  </button>
  <button class="deck-pill" data-deck="7">
    <span class="deck-number">07</span>
    <span class="deck-label">Promenade</span>
  </button>
</nav>
```

### 4.3 Floating Toolbars & Map Controls

Map control toolbars provide quick action widgets for map manipulation, compass alignment, layer toggles, and searching.

```
┌─────────────────────────┐
│ FLOATING MAP TOOLBAR    │
├─────────────────────────┤
│  [ + ]  Zoom In         │
│  [ - ]  Zoom Out        │
│  [ 🧭 ] Compass (North) │
│  [ ⚡ ] Upscale Layer   │
│  [ 🔍 ] Quick Filter    │
└─────────────────────────┘
```

#### Widget Specifications
- **Button Size**: `44px x 44px` icon buttons with `12px` border-radius.
- **Hover Micro-interaction**: Scale `1.05`, background transitions from `hsla(217,40%,20%,0.8)` to `hsla(187,100%,42%,0.2)`.
- **Active / Pressed**: Scale `0.95`.
- **Compass Rose**: Rotates smoothly with canvas bearing using `transform: rotate(calc(-1 * var(--map-heading-deg)))`.

### 4.4 Cabin & Venue Detail Modal Cards

When a user taps or clicks a cabin or venue on the deck plan, a high-detail modal card slides into view from the right (Desktop) or bottom (Mobile).

```
┌───────────────────────────────────────────────────────────┐
│ CABIN DETAIL MODAL                                    [X] │
├───────────────────────────────────────────────────────────┤
│  [ Hero Image Carousel: Royal Balcony Suite #7204 ]       │
├───────────────────────────────────────────────────────────┤
│  ROYAL BALCONY SUITE                                      │
│  Stateroom #7204 • Deck 7 (Midship)                       │
│                                                           │
│  [ Tag: Balcony ]  [ Tag: Sleeps 4 ]  [ Tag: Accessible ] │
│                                                           │
│  • Size: 345 sq. ft. + 85 sq. ft. Veranda                 │
│  • Features: King bed, sofa bed, marble bath, ocean view  │
│                                                           │
│  [ 🧭 NAVIGATE TO CABIN ]   [ ⭐ SAVE TO ITINERARY ]      │
└───────────────────────────────────────────────────────────┘
```

---

## 5. Accessibility & Contrast Compliance (WCAG 2.1 AA)

### 5.1 Color Contrast Matrix

All text and UI controls strictly meet or exceed **WCAG 2.1 Level AA** contrast ratios (minimum 4.5:1 for normal text, 3:1 for large text and UI components).

```
+------------------------------------+------------------+-------------------+
| UI Element Pair                    | Contrast Ratio   | Compliance Status |
+------------------------------------+------------------+-------------------+
| Primary Text (#f0f4f8) on Abyss    | 16.8:1           | WCAG AAA          |
| Secondary Text (#b0c4de) on Glass  | 9.4:1            | WCAG AAA          |
| Gold Accent (#e0aa3e) on Abyss     | 9.1:1            | WCAG AAA          |
| Cyan Accent (#00d9f5) on Dark Glass| 10.2:1           | WCAG AAA          |
| Amenity Dining Text on Tag BG      | 6.8:1            | WCAG AAA          |
| Focus Ring (#00e5ff) on Card BG    | 4.8:1            | WCAG AA           |
+------------------------------------+------------------+-------------------+
```

### 5.2 Focus Ring & Keyboard Navigation

Keyboard accessibility is paramount for interactive map navigation.

- **Focus Ring Tokens**:
  ```css
  :focus-visible {
    outline: 3px solid var(--accent-cyan);
    outline-offset: 3px;
    box-shadow: 0 0 12px var(--accent-cyan-glow);
  }
  ```
- **Keyboard Shortcut Mapping**:
  - `Tab / Shift+Tab`: Cycles through interactive map markers, search bar, and deck controls.
  - `Arrow Keys (Up/Down/Left/Right)`: Pans map viewer by 100px increments.
  - `PageUp / PageDown`: Switches active deck up or down.
  - `+ / - Key`: Zooms map canvas in and out.
  - `R Key`: Resets compass rotation to North-up.
  - `Escape`: Closes detail drawer/modal card.

### 5.3 Screen Reader & ARIA Standards

1. **Map Region Canvas**: `<main role="region" aria-label="Interactive Cruise Ship Deck Map" tabindex="0">`
2. **Live Announcements**: Uses an off-screen `aria-live="polite"` region to announce deck transitions and location updates.
   - *Example*: `"Switched to Deck 6 Lido. Showing 42 amenities including Lido Pool and Horizon Buffet."`
3. **SVG Marker Semantics**: Every clickable deck feature contains proper ARIA attributes:
   ```html
   <path 
     class="venue-polygon" 
     id="venue-lido-pool" 
     role="button" 
     tabindex="0" 
     aria-label="Lido Main Pool, Deck 6 Midship, Public Area" 
     aria-expanded="false" />
   ```

### 5.4 Motion Accessibility

Respect user preference for reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  
  .map-canvas {
    transition: none !important;
  }
}
```

---

## 6. Summary of Design Tokens Reference Sheet

```json
{
  "theme": "Luxury Nautical Dark Mode",
  "colors": {
    "background": {
      "abyss": "#050914",
      "ocean": "#0a111e",
      "surface": "#111a2d",
      "glass": "rgba(17, 26, 45, 0.65)"
    },
    "accents": {
      "gold": "#e0aa3e",
      "cyan": "#00d9f5",
      "emerald": "#10b981",
      "crimson": "#e11d48"
    }
  },
  "typography": {
    "display": "Outfit, sans-serif",
    "body": "Inter, sans-serif",
    "mono": "JetBrains Mono, monospace"
  },
  "elevation": {
    "blur_card": "16px",
    "blur_modal": "24px"
  }
}
```
