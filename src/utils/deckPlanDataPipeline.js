/**
 * Programmatic Geospatial Deck Plan Engine & Layout Optimizer
 * Generates non-overlapping, boundary-clamped, CAD-accurate vector deck plans.
 */

// Category Palette HSL Tokens
const BRAND_COLORS = {
  stateroom: "#3b82f6",
  veranda: "#2563eb",
  suite: "#f59e0b",
  iconicSuite: "#fbbf24",
  edgeVilla: "#d97706",
  dining: "#ef4444",
  bar: "#a855f7",
  entertainment: "#ec4899",
  pool: "#14b8a6",
  spa: "#06b6d4",
  service: "#64748b",
  magicCarpet: "#eab308",
  retreat: "#eab308"
};

// Generate realistic tapering ship hull contour coordinates per deck
export function generateHullOutline(deckNum) {
  if (deckNum === 16 || deckNum === 17) {
    // Top VIP Decks - Narrower profile
    return [
      [15, 20], [15, 80], [160, 80], [280, 75], [290, 50], [280, 25], [160, 20], [15, 20]
    ];
  }
  
  if (deckNum === 13) {
    // Navigation Bridge Deck - Wings overhang
    return [
      [10, 10], [10, 90], [50, 90], [120, 80], [120, 20], [50, 10], [10, 10]
    ];
  }

  // Standard Decks (Decks 3 - 15)
  return [
    [0, 50],       // Bow Tip
    [15, 30],      // Bow Port
    [40, 10],      // Forward Port
    [280, 10],     // Aft Port
    [310, 25],     // Stern Port Curve
    [327, 50],     // Stern Tip Center
    [310, 75],     // Stern Starboard Curve
    [280, 90],     // Aft Starboard
    [40, 90],      // Forward Starboard
    [15, 70],      // Bow Starboard
    [0, 50]        // Loop to Bow Tip
  ];
}

/**
 * Programmatically generates non-overlapping stateroom grid cells along Port & Starboard corridors
 * Strictly clamped inside the hull boundary.
 */
export function generateCorridorStaterooms(deckNum) {
  const rooms = [];
  const roomLength = 7.5; // 7.5m long room along X-axis (rooms are 14m deep along Y)

  // Define Port corridor row (Y: 14 to 28) and Starboard corridor row (Y: 72 to 86)
  const xStart = 45;
  const xEnd = 270;
  
  let roomCounterPort = deckNum * 1000 + 101;
  let roomCounterStbd = deckNum * 1000 + 102;

  for (let x = xStart; x + roomLength <= xEnd; x += roomLength + 0.5) {
    // 1. Port Side Stateroom (Y: 14 -> 28)
    let isSuitePort = (deckNum >= 10) && (Math.floor(x) % 5 === 0);
    let isAdaPort = (Math.floor(x) % 9 === 0);

    rooms.push({
      id: `c${deckNum}-${roomCounterPort}`,
      name: isSuitePort 
        ? `Suite ${roomCounterPort} (${deckNum >= 12 ? 'Edge Villa' : 'Sky Suite'})` 
        : `Stateroom ${roomCounterPort} (Infinite Veranda)`,
      category: isSuitePort ? "Suites" : "Staterooms",
      color: isSuitePort ? BRAND_COLORS.suite : BRAND_COLORS.stateroom,
      bounds: [[x, 14], [x + roomLength, 28]],
      center: [x + roomLength / 2, 21],
      description: isSuitePort
        ? `Luxury Suite on Deck ${deckNum} featuring floor-to-ceiling glass & butler service.`
        : `Edge Class Stateroom ${roomCounterPort} with automated Infinite Veranda window.`,
      sqft: isSuitePort ? (deckNum >= 12 ? 950 : 400) : 243,
      verandaSqft: isSuitePort ? 160 : 42,
      ada: isAdaPort,
      side: "Port",
      connecting: (roomCounterPort % 4 === 1) ? `${roomCounterPort + 2}` : null
    });
    roomCounterPort += 2;

    // 2. Starboard Side Stateroom (Y: 72 -> 86)
    let isSuiteStbd = (deckNum >= 10) && (Math.floor(x) % 6 === 0);
    let isAdaStbd = (Math.floor(x) % 11 === 0);

    rooms.push({
      id: `c${deckNum}-${roomCounterStbd}`,
      name: isSuiteStbd 
        ? `Suite ${roomCounterStbd} (${deckNum >= 12 ? 'Edge Villa' : 'Sky Suite'})` 
        : `Stateroom ${roomCounterStbd} (Infinite Veranda)`,
      category: isSuiteStbd ? "Suites" : "Staterooms",
      color: isSuiteStbd ? BRAND_COLORS.suite : BRAND_COLORS.stateroom,
      bounds: [[x, 72], [x + roomLength, 86]],
      center: [x + roomLength / 2, 79],
      description: isSuiteStbd
        ? `Luxury Suite ${roomCounterStbd} on Deck ${deckNum} with private veranda.`
        : `Stateroom ${roomCounterStbd} with automated Infinite Veranda window.`,
      sqft: isSuiteStbd ? 400 : 243,
      verandaSqft: isSuiteStbd ? 160 : 42,
      ada: isAdaStbd,
      side: "Starboard",
      connecting: (roomCounterStbd % 4 === 0) ? `${roomCounterStbd + 2}` : null
    });
    roomCounterStbd += 2;
  }

  return rooms;
}

/**
 * Programmatically generates elevator cores and stairwell trunks in the centerline (Y: 42 to 58)
 */
export function generateCenterlineCore(deckNum) {
  return [
    {
      id: `elev-fwd-${deckNum}`,
      name: `Forward Elevator Bank A (Deck ${deckNum})`,
      category: "Guest Services",
      color: BRAND_COLORS.service,
      bounds: [[70, 42], [85, 58]],
      center: [77.5, 50],
      description: "Forward glass elevator lobby serving Decks 3 to 16.",
      tags: ["Elevator", "Stairs", "Forward"]
    },
    {
      id: `elev-mid-${deckNum}`,
      name: `Midship Elevator Bank B (Deck ${deckNum})`,
      category: "Guest Services",
      color: BRAND_COLORS.service,
      bounds: [[160, 42], [175, 58]],
      center: [167.5, 50],
      description: "Midship elevator lobby overlooking the Grand Plaza atrium.",
      tags: ["Elevator", "Stairs", "Midship"]
    },
    {
      id: `elev-aft-${deckNum}`,
      name: `Aft Elevator Bank C (Deck ${deckNum})`,
      category: "Guest Services",
      color: BRAND_COLORS.service,
      bounds: [[245, 42], [260, 58]],
      center: [252.5, 50],
      description: "Aft elevator bank accessing dining and Eden.",
      tags: ["Elevator", "Stairs", "Aft"]
    }
  ];
}
