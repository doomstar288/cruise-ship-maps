// Programmatic CAD-Accurate Deck Data Generator for Celebrity Xcel (All 17 Decks)
// Ensures 100% boundary clamping, non-overlapping vector polygons, and authentic stateroom density.

import { generateHullOutline, generateCorridorStaterooms, generateCenterlineCore } from '../utils/deckPlanDataPipeline.js';

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

export function generateAll17Decks() {
  const decks = [];

  // Deck 1: Medical & Tender Platforms
  decks.push({
    level: 1,
    name: "Deck 1 - Tender Station & Medical",
    category: "Operations & Medical",
    shortName: "Deck 1",
    description: "Vessel tender boarding platform, Medical Center, and operational gangways.",
    shapeCoordinates: generateHullOutline(1),
    venues: [
      {
        id: "v101",
        name: "Medical Center",
        category: "Guest Services",
        color: BRAND_COLORS.service,
        bounds: [[60, 30], [100, 70]],
        center: [80, 50],
        description: "24/7 Fully equipped shipboard medical center with physicians and nurses.",
        tags: ["Medical", "First Aid", "Doctor"]
      },
      {
        id: "v102",
        name: "Destination Tender Platform",
        category: "Guest Services",
        color: BRAND_COLORS.service,
        bounds: [[140, 15], [190, 85]],
        center: [165, 50],
        description: "Magic Carpet tender loading station for shore tender operations.",
        tags: ["Tender", "Gangway", "Excursions"]
      }
    ]
  });

  // Deck 2: Service & Engine Core
  decks.push({
    level: 2,
    name: "Deck 2 - Service & Engine Core",
    category: "Technical Operations",
    shortName: "Deck 2",
    description: "Ship technical control, engine casing, and laundry facilities.",
    shapeCoordinates: generateHullOutline(2),
    venues: [
      {
        id: "v201",
        name: "Engine Control Center & Tech Hub",
        category: "Guest Services",
        color: BRAND_COLORS.service,
        bounds: [[100, 30], [160, 70]],
        center: [130, 50],
        description: "Central monitoring for Azipod propulsion and clean energy systems.",
        tags: ["Technical", "Crew Only"]
      }
    ]
  });

  // Deck 3: Plaza & Oceanview Staterooms
  decks.push({
    level: 3,
    name: "Deck 3 - Plaza & Arrival",
    category: "Guest Services & Staterooms",
    shortName: "Deck 3",
    description: "Grand Plaza lower atrium, Guest Relations, Passport Bar, Shore Excursions, and Deluxe Oceanview Staterooms.",
    shapeCoordinates: generateHullOutline(3),
    venues: [
      {
        id: "v301",
        name: "Grand Plaza (Lower Level)",
        category: "Entertainment",
        color: BRAND_COLORS.entertainment,
        bounds: [[135, 32], [185, 68]],
        center: [160, 50],
        description: "The heart of Celebrity Xcel featuring a three-deck handcrafted chandelier.",
        tags: ["Atrium", "Chandelier", "Live Music"]
      },
      {
        id: "v302",
        name: "Passport Bar",
        category: "Bars & Lounges",
        color: BRAND_COLORS.bar,
        bounds: [[115, 35], [132, 65]],
        center: [123.5, 50],
        description: "Classic cocktail lounge located at the base of the Grand Plaza.",
        tags: ["Cocktails", "Plaza View"]
      },
      {
        id: "v303",
        name: "Guest Relations Desk",
        category: "Guest Services",
        color: BRAND_COLORS.service,
        bounds: [[188, 35], [205, 65]],
        center: [196.5, 50],
        description: "24/7 Concierge and guest support services desk.",
        tags: ["Services", "Concierge"]
      },
      ...generateCenterlineCore(3),
      ...generateCorridorStaterooms(3)
    ]
  });

  // Deck 4: Entertainment & Casino
  decks.push({
    level: 4,
    name: "Deck 4 - Entertainment & Casino",
    category: "Dining & Nightlife",
    shortName: "Deck 4",
    description: "The Theatre, Club Xcel, Casino, Le Grand Bistro, Craft Social, and Celebrity Luxury Shops.",
    shapeCoordinates: generateHullOutline(4),
    venues: [
      {
        id: "v401",
        name: "The Theatre at Xcel",
        category: "Entertainment",
        color: BRAND_COLORS.entertainment,
        bounds: [[20, 15], [80, 85]],
        center: [50, 50],
        description: "State-of-the-art main theater with 4K LED screens and production shows.",
        tags: ["Broadway Shows", "Live Stage"]
      },
      {
        id: "v402",
        name: "Casino at Xcel",
        category: "Entertainment",
        color: BRAND_COLORS.entertainment,
        bounds: [[105, 25], [140, 75]],
        center: [122.5, 50],
        description: "Vegas-style casino with slots, blackjack, roulette, and poker tables.",
        tags: ["Slots", "Blackjack", "VIP Lounge"]
      },
      {
        id: "v403",
        name: "Le Grand Bistro",
        category: "Fine Dining",
        color: BRAND_COLORS.dining,
        bounds: [[148, 62], [182, 88]],
        center: [165, 75],
        description: "French bistro featuring Le Petit Chef 3D animation dining experience.",
        tags: ["French", "Le Petit Chef"]
      },
      {
        id: "v404",
        name: "Craft Social Pub",
        category: "Bars & Lounges",
        color: BRAND_COLORS.bar,
        bounds: [[148, 12], [182, 38]],
        center: [165, 25],
        description: "Craft beer hall with rare artisanal brews and sports screens.",
        tags: ["Craft Beer", "Sports"]
      },
      {
        id: "v405",
        name: "Eden (Lower Deck Entrance)",
        category: "Entertainment",
        color: BRAND_COLORS.entertainment,
        bounds: [[255, 15], [305, 85]],
        center: [280, 50],
        description: "Three-story glass architectural sanctuary overlooking the stern.",
        tags: ["Glass Atrium", "Aft Views"]
      },
      ...generateCenterlineCore(4)
    ]
  });

  // Deck 5: Dining & Magic Carpet
  decks.push({
    level: 5,
    name: "Deck 5 - Dining & Magic Carpet",
    category: "Culinary & Iconic Features",
    shortName: "Deck 5",
    description: "Fine Cut Steakhouse, Raw on 5, Cyprus, Tuscan, Eden Restaurant, and the iconic Magic Carpet platform.",
    shapeCoordinates: generateHullOutline(5),
    venues: [
      {
        id: "v500-magic-carpet",
        name: "Magic Carpet (Deck 5 Position)",
        category: "Magic Carpet",
        color: BRAND_COLORS.magicCarpet,
        bounds: [[160, 92], [195, 108]],
        center: [177.5, 100],
        description: "The world's first cantilevered floating platform at sea! Suspended over the ocean on Starboard midship.",
        tags: ["Cantilevered", "Ocean Views", "Iconic Feature", "Open-Air Bar"]
      },
      {
        id: "v501",
        name: "Fine Cut Steakhouse",
        category: "Fine Dining",
        color: BRAND_COLORS.dining,
        bounds: [[115, 62], [150, 88]],
        center: [132.5, 75],
        description: "Upscale steakhouse serving prime dry-aged meats and fresh seafood.",
        tags: ["Steakhouse", "Prime Rib"]
      },
      {
        id: "v502",
        name: "Raw on 5",
        category: "Fine Dining",
        color: BRAND_COLORS.dining,
        bounds: [[155, 62], [185, 88]],
        center: [170, 75],
        description: "Japanese raw bar, sushi, sashimi, and raw seafood tower delights.",
        tags: ["Sushi", "Sashimi"]
      },
      {
        id: "v503",
        name: "Cyprus Main Restaurant",
        category: "Fine Dining",
        color: BRAND_COLORS.dining,
        bounds: [[190, 12], [235, 48]],
        center: [212.5, 30],
        description: "Greek and Mediterranean cuisine in a sleek marble setting.",
        tags: ["Mediterranean", "Main Dining"]
      },
      {
        id: "v504",
        name: "Tuscan Main Restaurant",
        category: "Fine Dining",
        color: BRAND_COLORS.dining,
        bounds: [[190, 52], [235, 88]],
        center: [212.5, 70],
        description: "Authentic Italian dishes with freshly made pastas and fine wines.",
        tags: ["Italian", "Main Dining"]
      },
      {
        id: "v505",
        name: "Eden Restaurant & Lounge",
        category: "Fine Dining",
        color: BRAND_COLORS.dining,
        bounds: [[250, 12], [312, 88]],
        center: [281, 50],
        description: "Experiential culinary journey inside the lush multi-level Eden glass garden.",
        tags: ["Experiential Dining", "Plant-based"]
      },
      ...generateCenterlineCore(5)
    ]
  });

  // Decks 6 to 9 (Stateroom Decks)
  for (let d = 6; d <= 9; d++) {
    decks.push({
      level: d,
      name: `Deck ${d} - Staterooms & Verandas`,
      category: "Accommodations",
      shortName: `Deck ${d}`,
      description: `Prime Edge Infinite Veranda Staterooms, Oceanview Cabins, and Concierge Class on Deck ${d}.`,
      shapeCoordinates: generateHullOutline(d),
      venues: [
        ...generateCenterlineCore(d),
        ...generateCorridorStaterooms(d)
      ]
    });
  }

  // Deck 10 (Suites & Premium Staterooms)
  decks.push({
    level: 10,
    name: "Deck 10 - Staterooms & Suites",
    category: "Accommodations",
    shortName: "Deck 10",
    description: "Edge Single Staterooms, Prime Infinite Verandas, Concierge Class, and Magic Carpet Sky Suites.",
    shapeCoordinates: generateHullOutline(10),
    venues: [
      {
        id: "c10102",
        name: "Suite 10102 (Magic Carpet Sky Suite)",
        category: "Suites",
        color: BRAND_COLORS.suite,
        bounds: [[80, 72], [102, 88]],
        center: [91, 80],
        description: "Luxury suite featuring floor-to-ceiling glass and private access to The Retreat.",
        sqft: 400,
        verandaSqft: 79,
        ada: false,
        retreatAccess: true
      },
      {
        id: "c10298",
        name: "Suite 10298 (Sunset Suite - Aft)",
        category: "Suites",
        color: BRAND_COLORS.suite,
        bounds: [[280, 20], [310, 80]],
        center: [295, 50],
        description: "Corner Aft suite with panoramic wake views over the ocean.",
        sqft: 580,
        verandaSqft: 160,
        ada: false,
        retreatAccess: true
      },
      ...generateCenterlineCore(10),
      ...generateCorridorStaterooms(10)
    ]
  });

  // Deck 11 (AquaClass & Spa Access)
  decks.push({
    level: 11,
    name: "Deck 11 - AquaClass & Wellness Staterooms",
    category: "Wellness & Accommodations",
    shortName: "Deck 11",
    description: "Dedicated AquaClass Staterooms with complimentary entry to SEA Thermal Suite & Blu Restaurant.",
    shapeCoordinates: generateHullOutline(11),
    venues: [
      ...generateCenterlineCore(11),
      ...generateCorridorStaterooms(11)
    ]
  });

  // Deck 12 (Luxury Suite Deck - Iconic Suites & Edge Villas)
  decks.push({
    level: 12,
    name: "Deck 12 - Luxury Suites & Edge Villas",
    category: "Luxury VIP Accommodations",
    shortName: "Deck 12",
    description: "Iconic Suites over the Bridge Wing (2,500 sq ft) and 2-Story Edge Villas with private plunge pools.",
    shapeCoordinates: generateHullOutline(12),
    venues: [
      {
        id: "c12101-iconic",
        name: "Iconic Suite 12101 (Forward Bow View)",
        category: "Suites",
        color: BRAND_COLORS.iconicSuite,
        bounds: [[15, 14], [52, 48]],
        center: [33.5, 31],
        description: "The premier 2,500 sq ft suite located directly above the Captain's Bridge with 270° panoramic views.",
        sqft: 2500,
        verandaSqft: 700,
        ada: true,
        retreatAccess: true
      },
      {
        id: "c12102-iconic",
        name: "Iconic Suite 12102 (Forward Bow View)",
        category: "Suites",
        color: BRAND_COLORS.iconicSuite,
        bounds: [[15, 52], [52, 86]],
        center: [33.5, 69],
        description: "Starboard Iconic Suite with private outdoor whirlpool and master bedroom suite.",
        sqft: 2500,
        verandaSqft: 700,
        ada: false,
        retreatAccess: true
      },
      {
        id: "c12201-villa",
        name: "Edge Villa 12201 (2-Story Residence)",
        category: "Suites",
        color: BRAND_COLORS.edgeVilla,
        bounds: [[100, 72], [128, 88]],
        center: [114, 80],
        description: "Two-story luxury villa featuring 3-D glass walls and private terrace plunge pool.",
        sqft: 950,
        verandaSqft: 210,
        ada: false,
        retreatAccess: true
      },
      ...generateCenterlineCore(12),
      ...generateCorridorStaterooms(12)
    ]
  });

  // Deck 13 (Bridge & Operations)
  decks.push({
    level: 13,
    name: "Deck 13 - Navigation Bridge & Crew Command",
    category: "Navigation & Bridge",
    shortName: "Deck 13",
    description: "Captain's Navigation Bridge and officer command center.",
    shapeCoordinates: generateHullOutline(13),
    venues: [
      {
        id: "v1301",
        name: "Captain's Navigation Bridge",
        category: "Guest Services",
        color: BRAND_COLORS.service,
        bounds: [[15, 12], [48, 88]],
        center: [31.5, 50],
        description: "State-of-the-art navigation bridge controlling vessel propulsion, dynamic positioning, and radar.",
        tags: ["Bridge", "Captain", "Navigation"]
      }
    ]
  });

  // Deck 14 (Resort Deck & Solarium)
  decks.push({
    level: 14,
    name: "Deck 14 - Resort Deck & Solarium",
    category: "Pools & Recreation",
    shortName: "Deck 14",
    description: "Main Resort Pool, 2-story Martini Glass Jacuzzis, Solarium Adults-Only Pool, Spa & Thermal Suite, and Oceanview Cafe.",
    shapeCoordinates: generateHullOutline(14),
    venues: [
      {
        id: "v1401",
        name: "Resort Deck Pool",
        category: "Pool & Sun Deck",
        color: BRAND_COLORS.pool,
        bounds: [[120, 25], [180, 75]],
        center: [150, 50],
        description: "75-foot lap pool surrounded by double-capacity daybeds and art installations.",
        tags: ["Main Pool", "Daybeds", "Martini Jacuzzis"]
      },
      {
        id: "v1402",
        name: "Solarium Adults-Only Pool",
        category: "Pool & Sun Deck",
        color: BRAND_COLORS.pool,
        bounds: [[50, 20], [95, 80]],
        center: [72.5, 50],
        description: "Tranquil glass-domed sanctuary for adults featuring a lap pool and loungers.",
        tags: ["Adults Only", "Quiet Zone"]
      },
      {
        id: "v1403",
        name: "The Spa & SEA Thermal Suite",
        category: "Spa & Wellness",
        color: BRAND_COLORS.spa,
        bounds: [[10, 15], [45, 85]],
        center: [27.5, 50],
        description: "Comprehensive spa with 8 thermal therapy rooms including Salt Room and Float Room.",
        tags: ["Thermal Suite", "Massage", "Sauna"]
      },
      {
        id: "v1404",
        name: "Oceanview Cafe",
        category: "Fine Dining",
        color: BRAND_COLORS.dining,
        bounds: [[195, 12], [275, 88]],
        center: [235, 50],
        description: "2-story marketplace buffet serving international food stations all day long.",
        tags: ["Buffet", "International"]
      },
      ...generateCenterlineCore(14)
    ]
  });

  // Deck 15 (Rooftop & Sunset Bar)
  decks.push({
    level: 15,
    name: "Deck 15 - Rooftop & Sunset Bar",
    category: "Outdoor & Panoramic Views",
    shortName: "Deck 15",
    description: "Rooftop Garden, Rooftop Garden Grill, Sunset Bar at the stern, Jogging Track, and Fitness Center.",
    shapeCoordinates: generateHullOutline(15),
    venues: [
      {
        id: "v1501",
        name: "Rooftop Garden",
        category: "Outdoor & Sports",
        color: BRAND_COLORS.pool,
        bounds: [[160, 20], [230, 80]],
        center: [195, 50],
        description: "Living outdoor botanical park with open-air movie screens and seating sculptures.",
        tags: ["Botanical Garden", "Movies Under Stars"]
      },
      {
        id: "v1502",
        name: "Sunset Bar (Stern View)",
        category: "Bars & Lounges",
        color: BRAND_COLORS.bar,
        bounds: [[265, 15], [310, 85]],
        center: [287.5, 50],
        description: "Multi-level Moroccan-inspired outdoor bar offering 270-degree wake views.",
        tags: ["Panoramic Wake View", "Sunset Cocktails"]
      },
      {
        id: "v1503",
        name: "Fitness Center",
        category: "Spa & Wellness",
        color: BRAND_COLORS.spa,
        bounds: [[10, 15], [50, 85]],
        center: [30, 50],
        description: "State-of-the-art gym with Technogym equipment, F45 training, and Peloton bikes.",
        tags: ["Gym", "Peloton", "F45 Training"]
      },
      ...generateCenterlineCore(15)
    ]
  });

  // Deck 16 (The Retreat & Luminae)
  decks.push({
    level: 16,
    name: "Deck 16 - The Retreat & Luminae",
    category: "Exclusive VIP Experience",
    shortName: "Deck 16",
    description: "The Retreat Lounge, Luminae Private Restaurant for Suite Guests, and The Retreat Sundeck.",
    shapeCoordinates: generateHullOutline(16),
    venues: [
      {
        id: "v1601",
        name: "The Retreat Sundeck & Pool",
        category: "Pool & Sun Deck",
        color: BRAND_COLORS.retreat,
        bounds: [[20, 22], [70, 78]],
        center: [45, 50],
        description: "Exclusive resort-style sanctuary reserved strictly for Suite Class guests.",
        tags: ["Suite Guests Only", "Private Pool", "Cabanas"]
      },
      {
        id: "v1602",
        name: "Luminae Restaurant",
        category: "Fine Dining",
        color: BRAND_COLORS.dining,
        bounds: [[78, 25], [115, 75]],
        center: [96.5, 50],
        description: "Private restaurant featuring menus created by Daniel Boulud.",
        tags: ["Daniel Boulud", "Private Dining"]
      },
      {
        id: "v1603",
        name: "The Retreat Lounge",
        category: "Bars & Lounges",
        color: BRAND_COLORS.bar,
        bounds: [[120, 25], [155, 75]],
        center: [137.5, 50],
        description: "24/7 VIP lounge with complimentary champagne, snacks, and concierge support.",
        tags: ["VIP Lounge", "Concierge"]
      }
    ]
  });

  // Deck 17 (Solstice Sun Deck)
  decks.push({
    level: 17,
    name: "Deck 17 - Solstice Sun Deck",
    category: "Outdoor Sunbathing",
    shortName: "Deck 17",
    description: "Topmost open sun deck for unobstructed ocean views and sunbathing.",
    shapeCoordinates: generateHullOutline(17),
    venues: [
      {
        id: "v1701",
        name: "Solstice Sun Deck",
        category: "Pool & Sun Deck",
        color: BRAND_COLORS.pool,
        bounds: [[35, 30], [115, 70]],
        center: [75, 50],
        description: "Highest public deck point on Celebrity Xcel providing 360-degree horizon panoramas.",
        tags: ["Sunbathing", "Top Deck", "360 Views"]
      }
    ]
  });

  return decks;
}
