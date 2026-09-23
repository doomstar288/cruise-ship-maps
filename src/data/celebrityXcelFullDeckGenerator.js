// Deck data for Celebrity Xcel's 15 guest decks (2–12 and 14–17; the ship has
// no Deck 1 or 13 for guests). Venue decks and fore/aft zoning follow published
// descriptions of the ship; exact footprints are synthetic approximations.
//
// `positionConfidence` records how far a venue's placement can be trusted. Leave
// it unset when deck and fore/aft zone trace to a published source (the exporter
// defaults guest venues to "zone"). Set "estimated", with the reason alongside,
// when sources conflict, no source places the venue, or Celebrity's own plan
// puts it in a different zone than drawn here. Nothing is "verified" until P1.1
// checks deck, zone and side against an official plan.

import {
  CORE_STATIONS,
  MAGIC_CARPET_X,
  STERN_STAIR_X,
  VENUE_COLORS as C,
  clampToHull,
  generateCenterlineCore,
  generateHullOutline,
  generateServiceStrips,
  generateStaterooms,
  magicCarpetStop,
  placeVenue,
} from '../utils/deckPlanDataPipeline.js';

// Across-ship bands (y, metres from the port hull).
const PORT = [0, 19.3];
const STBD = [19.7, 39];
const PORT_EDGE = [0, 11.5];
const STBD_EDGE = [27.5, 39];
const CENTER = [12, 27];

const CORES = [CORE_STATIONS.fwd.x, CORE_STATIONS.mid.x, CORE_STATIONS.aft.x];

function deck(level, { title, category, description, venues }) {
  return {
    level,
    name: `Deck ${level} - ${title}`,
    title,
    category,
    shortName: `Deck ${level}`,
    description,
    shapeCoordinates: generateHullOutline(level),
    venues,
  };
}

const venue = (level, fields) => placeVenue(level, fields);

// ------------------------------------------------------------- names and spans

/**
 * Venues that occupy more than one deck. The deck data draws each level as its
 * own record, so every level carries the whole span and the names a daily
 * program uses for the venue as a whole. A consumer can then find the venue from
 * whichever level it matches first.
 *
 * `venueGroup` ties the levels together for this repo's own checks (a shared
 * alias is only legal within one group); the exporter does not publish it.
 */
const VENUE_GROUPS = {
  theatre: { spansDecks: [3, 4, 5], aliases: ['The Theatre', 'The Theater', 'Theatre', 'Theater'] },
  'grand-plaza': { spansDecks: [3, 4, 5], aliases: ['Grand Plaza', 'Grand Plaza Bar'] },
  // Mosaic (4), the Market and Spice Café (5) and the upper level (6) all sit
  // inside the one triple-height Bazaar, so they share its span. They keep their
  // own names: "The Bazaar" alone means the upper-level entertainment space, not
  // the restaurants below it, so only that level answers to it.
  'the-bazaar': { spansDecks: [4, 5, 6], aliases: [] },
  // The Attic is the second floor of The Club, with its own programming.
  'the-club': { spansDecks: [4, 5], aliases: [] },
  'magic-carpet': { spansDecks: [2, 5, 14, 16], aliases: ['Magic Carpet', 'Magic Carpet Bar'] },
};

/** Fields for one level of a multi-deck venue, plus names only this level answers
 *  to. The exporter drops an alias that repeats the feature's own name. */
const partOf = (venueGroup, { aliases = [] } = {}) => ({
  venueGroup,
  spansDecks: VENUE_GROUPS[venueGroup].spansDecks,
  aliases: [...VENUE_GROUPS[venueGroup].aliases, ...aliases],
});

// ---------------------------------------------------------------- stateroom decks

/** Standard mid/aft veranda cabin, with Prime Edge through the midship section. */
const edgeVeranda = (x) => (x >= 95 && x < 186 ? 'E1' : 'E3');

/** Magic Carpet Sky Suite directly forward of the platform's starboard track. */
const nextToMagicCarpet = ({ x, side, row }) => side === 'Starboard' && row === 'outside' && x >= 144 && x < 154;

function stateroomDeck(level, { range, typeFor, transom = true, extraBanks = [], fixedCabins = [], cabinRanges }) {
  const avoid = [...CORES, ...(transom ? [STERN_STAIR_X] : [])];
  const cabins = generateStaterooms(level, {
    range,
    avoid,
    starboardOutsideAvoid: [MAGIC_CARPET_X],
    typeFor: (ctx) => {
      if (nextToMagicCarpet(ctx)) return 'MS';
      return typeFor(ctx);
    },
    transom: transom ? { corner: 'SS', middle: 'SV' } : undefined,
    fixedCabins,
    cabinRanges,
  });
  return [
    ...generateCenterlineCore(level, ['fwd', 'mid', 'aft', ...(transom ? ['stern'] : []), ...extraBanks]),
    ...generateServiceStrips(level, { range, avoid }),
    ...cabins,
  ];
}

export function generateAllDecks() {
  const decks = [];

  // Deck 2 — tender platform, medical centre, teen club. No staterooms.
  decks.push(
    deck(2, {
      title: 'Destination Gateway & Medical',
      category: 'Tenders & Guest Services',
      description:
        'Destination Gateway tender lounge beside the Magic Carpet tender platform, the Medical Center near the forward elevators, and The Basement teen club.',
      venues: [
        venue(2, {
          id: 'v2-medical',
          name: 'Medical Center',
          category: 'Guest Services',
          color: C.service,
          x: [58, 80],
          description: 'Shipboard medical center staffed by physicians and nurses, near the forward elevators.',
          tags: ['Medical', 'First Aid'],
        }),
        ...generateCenterlineCore(2),
        venue(2, {
          id: 'v2-basement',
          name: 'The Basement',
          category: 'Kids & Teens',
          color: C.entertainment,
          x: [98, 134],
          y: PORT,
          description: 'Teen hangout with games, music and activities for guests aged 13–17.',
          tags: ['Teens', 'Games'],
        }),
        venue(2, {
          id: 'v2-crew-fwd',
          name: 'Crew Areas',
          category: 'Crew & Service',
          color: C.backOfHouse,
          x: [98, 148],
          y: STBD,
          description: 'Crew mess, offices and quarters. Crew only.',
          tags: ['Crew Only'],
        }),
        venue(2, {
          id: 'v2-gangway',
          positionConfidence: 'estimated', // not in any published source
          name: 'Gangway & Security',
          category: 'Guest Services',
          color: C.service,
          x: [136, 184],
          y: PORT,
          description: 'Embarkation gangway and security screening.',
          tags: ['Gangway', 'Embarkation'],
        }),
        venue(2, {
          id: 'v2-destination-gateway',
          name: 'Destination Gateway',
          category: 'Guest Services',
          color: C.service,
          x: [150, 184],
          y: STBD,
          description: 'Tender lounge where guests board shore tenders from the Magic Carpet.',
          tags: ['Tender', 'Shore Excursions'],
        }),
        magicCarpetStop(2, {
          name: 'Magic Carpet (Tender Platform)',
          ...partOf('magic-carpet'),
          description: 'At Deck 2 the Magic Carpet becomes a tender embarkation platform for Destination Gateway.',
          tags: ['Tender Platform', 'Starboard'],
        }),
        venue(2, {
          id: 'v2-crew-aft',
          name: 'Crew & Technical Areas',
          category: 'Crew & Service',
          color: C.backOfHouse,
          x: [200, 260],
          description: 'Stores, laundry and technical spaces. Crew only.',
          tags: ['Crew Only'],
        }),
        venue(2, {
          id: 'v2-crew-stern',
          name: 'Provision Stores',
          category: 'Crew & Service',
          color: C.backOfHouse,
          x: [276, 322],
          description: 'Provision and galley stores. Crew only.',
          tags: ['Crew Only'],
          hideLabel: true,
        }),
      ],
    })
  );

  // Deck 3 — Theatre (lower), Grand Plaza (lower), Martini Bar, guest services, two main restaurants.
  decks.push(
    deck(3, {
      title: 'Grand Plaza & Guest Services',
      category: 'Public Venues & Staterooms',
      description:
        'The Theatre (lower level) forward, the Grand Plaza with its circular Martini Bar, Guest Relations, Camp at Sea, inside and oceanview staterooms, and the Tuscan and Normandie restaurants aft.',
      venues: [
        venue(3, {
          id: 'v3-theatre',
          ...partOf('theatre'),
          positionConfidence: 'verified',
          name: 'The Theatre',
          category: 'Entertainment',
          color: C.entertainment,
          x: [24, 78],
          description: 'Three-deck main theater (Decks 3–5) with a 360° stage and production shows. Lower level entrance.',
          tags: ['Shows', 'Lower Level'],
        }),
        ...generateCenterlineCore(3),
        ...generateServiceStrips(3, { range: [96, 150] }),
        ...generateStaterooms(3, {
          range: [96, 150],
          typeFor: ({ row }) => (row === 'outside' ? 'O2' : 'I2'),
        }),
        venue(3, {
          id: 'v3-grand-plaza',
          ...partOf('grand-plaza'),
          name: 'Grand Plaza',
          category: 'Entertainment',
          color: C.entertainment,
          x: [152, 184],
          y: [7, 32],
          description: 'The ship’s three-deck social hub beneath a kinetic chandelier. Lower level.',
          tags: ['Atrium', 'Live Music'],
        }),
        venue(3, {
          id: 'v3-martini-bar',
          aliases: ['Martini Bar'],
          positionConfidence: 'estimated', // sources conflict: Deck 2 vs Deck 3
          name: 'The Martini Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [162, 176],
          y: [14, 25],
          description: 'Full-circle bar at the center of the Grand Plaza, known for its flair bartenders.',
          tags: ['Cocktails', 'Grand Plaza'],
        }),
        venue(3, {
          id: 'v3-plaza-cafe',
          aliases: ['Grand Plaza Cafe'],
          name: 'Grand Plaza Café',
          category: 'Casual Dining',
          color: C.dining,
          x: [152, 172],
          y: [32.5, 39],
          description: 'Coffee, pastries and light bites on the Grand Plaza.',
          tags: ['Coffee', 'Snacks'],
        }),
        venue(3, {
          id: 'v3-shore-excursions',
          positionConfidence: 'estimated', // sources conflict: Deck 3 vs Deck 4
          name: 'Shore Excursions',
          category: 'Guest Services',
          color: C.service,
          x: [200, 224],
          y: [0, 17],
          description: 'Book and manage shore excursions.',
          tags: ['Excursions'],
        }),
        venue(3, {
          id: 'v3-guest-relations',
          name: 'Guest Relations',
          category: 'Guest Services',
          color: C.service,
          x: [200, 224],
          y: [22, 39],
          description: 'Guest services desk for onboard accounts and questions.',
          tags: ['Services', 'Help Desk'],
        }),
        venue(3, {
          id: 'v3-camp-at-sea',
          positionConfidence: 'estimated', // Celebrity's plan labels it forward, not aft
          name: 'Camp at Sea',
          category: 'Kids & Teens',
          color: C.entertainment,
          x: [226, 260],
          y: [0, 17],
          description: 'Kids club with age-grouped activities.',
          tags: ['Kids'],
        }),
        venue(3, {
          id: 'v3-concierge-lounge',
          positionConfidence: 'estimated', // Celebrity's plan labels it midship, not aft
          name: 'Concierge Lounge',
          category: 'Guest Services',
          color: C.service,
          x: [226, 260],
          y: [22, 39],
          description: 'Lounge and desk for Concierge Class guests.',
          tags: ['Concierge'],
        }),
        venue(3, {
          id: 'v3-normandie',
          positionConfidence: 'verified',
          name: 'Normandie Restaurant',
          category: 'Fine Dining',
          color: C.dining,
          x: [276, 325],
          y: PORT,
          description: 'Complimentary main restaurant serving French-inspired cuisine.',
          tags: ['Main Dining', 'French'],
        }),
        venue(3, {
          id: 'v3-tuscan',
          positionConfidence: 'verified',
          name: 'Tuscan Restaurant',
          category: 'Fine Dining',
          color: C.dining,
          x: [276, 325],
          y: STBD,
          description: 'Complimentary main restaurant serving Italian dishes.',
          tags: ['Main Dining', 'Italian'],
        }),
      ],
    })
  );

  // Deck 4 — Theatre (middle), Grand Plaza (middle), casino, The Club, Bazaar (lower) aft.
  decks.push(
    deck(4, {
      title: 'Casino, Dining & The Bazaar',
      category: 'Dining & Nightlife',
      description:
        'The Theatre (middle level), Le Voyage by Daniel Boulud, Le Grand Bistro and Café al Bacio on the Grand Plaza, the Casino, Craft Social, The Club, Cosmopolitan and Cyprus restaurants, and The Bazaar’s lower level with Mosaic aft.',
      venues: [
        venue(4, {
          id: 'v4-theatre',
          ...partOf('theatre'),
          positionConfidence: 'verified',
          name: 'The Theatre (Middle Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [24, 78],
          description: 'Middle level of the three-deck main theater.',
          tags: ['Shows'],
        }),
        ...generateCenterlineCore(4),
        venue(4, {
          id: 'v4-photo',
          name: 'Photo Gallery & Studio',
          category: 'Shopping & Galleries',
          color: C.shopping,
          x: [96, 124],
          y: PORT,
          description: 'Portrait studio and photo gallery.',
          tags: ['Photos'],
        }),
        venue(4, {
          id: 'v4-shops',
          name: 'Celebrity Shops',
          category: 'Shopping & Galleries',
          color: C.shopping,
          x: [96, 124],
          y: STBD,
          description: 'Duty-free boutiques, jewelry and watches.',
          tags: ['Shopping'],
        }),
        venue(4, {
          id: 'v4-le-voyage',
          positionConfidence: 'verified',
          name: 'Le Voyage by Daniel Boulud',
          category: 'Fine Dining',
          color: C.dining,
          x: [126, 150],
          y: PORT,
          description: 'Specialty restaurant with a globe-trotting menu by Chef Daniel Boulud. New on Xcel.',
          tags: ['Specialty Dining', 'Daniel Boulud'],
        }),
        venue(4, {
          id: 'v4-le-grand-bistro',
          aliases: ['Le Bistro', 'Le Petit Chef'],
          name: 'Le Grand Bistro',
          category: 'Fine Dining',
          color: C.dining,
          x: [152, 184],
          y: PORT_EDGE,
          description: 'French bistro on the Grand Plaza; hosts Le Petit Chef animated dining at night.',
          tags: ['French', 'Le Petit Chef'],
        }),
        venue(4, {
          id: 'v4-grand-plaza',
          ...partOf('grand-plaza'),
          positionConfidence: 'verified',
          name: 'Grand Plaza (Middle Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [152, 184],
          y: CENTER,
          description: 'Middle level of the Grand Plaza atrium.',
          tags: ['Atrium'],
        }),
        venue(4, {
          id: 'v4-cafe-al-bacio',
          aliases: ['Cafe al Bacio'],
          name: 'Café al Bacio',
          category: 'Casual Dining',
          color: C.dining,
          x: [152, 184],
          y: STBD_EDGE,
          description: 'Italian-style café serving espresso, gelato and pastries.',
          tags: ['Coffee', 'Gelato'],
        }),
        venue(4, {
          id: 'v4-casino',
          positionConfidence: 'verified',
          name: 'Casino',
          category: 'Entertainment',
          color: C.entertainment,
          x: [200, 240],
          y: [12, 39],
          description: 'Slots and table games.',
          tags: ['Slots', 'Blackjack'],
        }),
        venue(4, {
          id: 'v4-craft-social',
          positionConfidence: 'estimated',
          name: 'Craft Social',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [242, 260],
          y: STBD,
          description: 'Craft beer and cocktail pub with sports on screen.',
          tags: ['Craft Beer', 'Sports'],
        }),
        venue(4, {
          id: 'v4-the-club',
          ...partOf('the-club'),
          positionConfidence: 'verified',
          name: 'The Club',
          category: 'Entertainment',
          color: C.entertainment,
          x: [242, 260],
          y: PORT,
          description: 'Two-level nightlife and performance venue. Lower level.',
          tags: ['Nightlife', 'Live Music'],
        }),
        venue(4, {
          id: 'v4-cosmopolitan',
          positionConfidence: 'verified',
          name: 'Cosmopolitan Restaurant',
          category: 'Fine Dining',
          color: C.dining,
          x: [276, 296],
          y: PORT,
          description: 'Complimentary main restaurant with a contemporary menu.',
          tags: ['Main Dining'],
        }),
        venue(4, {
          id: 'v4-cyprus',
          positionConfidence: 'verified',
          name: 'Cyprus Restaurant',
          category: 'Fine Dining',
          color: C.dining,
          x: [276, 296],
          y: STBD,
          description: 'Complimentary main restaurant with Greek and Mediterranean dishes.',
          tags: ['Main Dining', 'Mediterranean'],
        }),
        venue(4, {
          id: 'v4-mosaic',
          ...partOf('the-bazaar', { aliases: ['Mosaic'] }),
          name: 'Mosaic at The Bazaar',
          category: 'Fine Dining',
          color: C.dining,
          x: [298, 327],
          description: 'Restaurant on the lower level of The Bazaar, the triple-height aft space that replaced Eden on Xcel.',
          tags: ['The Bazaar', 'New on Xcel'],
        }),
      ],
    })
  );

  // Deck 5 — Theatre (upper), Grand Plaza (upper), Fine Cut, Raw on 5, Blu, Bazaar (middle), Magic Carpet.
  decks.push(
    deck(5, {
      title: 'Grand Plaza, Dining & Magic Carpet',
      category: 'Culinary & Iconic Features',
      description:
        'The Theatre (upper level), Fine Cut Steakhouse, Raw on 5, World Class Bar and Blu around the upper Grand Plaza, the Magic Carpet’s dining stop on the starboard side, and the Market and Spice Café in The Bazaar aft.',
      venues: [
        venue(5, {
          id: 'v5-theatre',
          ...partOf('theatre'),
          positionConfidence: 'verified',
          name: 'The Theatre (Upper Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [24, 78],
          description: 'Upper level of the three-deck main theater.',
          tags: ['Shows'],
        }),
        ...generateCenterlineCore(5),
        venue(5, {
          id: 'v5-art-gallery',
          name: 'Art Gallery',
          category: 'Shopping & Galleries',
          color: C.shopping,
          x: [96, 114],
          y: PORT,
          description: 'Fine art collection and auctions.',
          tags: ['Art'],
        }),
        venue(5, {
          id: 'v5-flagship-store',
          positionConfidence: 'estimated', // Celebrity's plan labels it midship, not forward
          name: 'Celebrity Flagship Store',
          category: 'Shopping & Galleries',
          color: C.shopping,
          x: [96, 114],
          y: STBD,
          description: 'Celebrity-branded boutique. New on Xcel.',
          tags: ['Shopping', 'New on Xcel'],
        }),
        venue(5, {
          id: 'v5-annex',
          positionConfidence: 'estimated', // no published source gives its fore/aft zone
          name: 'The Annex',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [116, 184],
          y: PORT_EDGE,
          description: 'Intimate lounge space. New on Xcel.',
          tags: ['Lounge', 'New on Xcel'],
        }),
        venue(5, {
          id: 'v5-shops',
          positionConfidence: 'estimated', // no published source gives its fore/aft zone
          name: 'Boutiques',
          category: 'Shopping & Galleries',
          color: C.shopping,
          x: [116, 134],
          y: STBD,
          description: 'Luxury retail boutiques.',
          tags: ['Shopping'],
        }),
        venue(5, {
          id: 'v5-grand-plaza',
          ...partOf('grand-plaza'),
          name: 'Grand Plaza (Upper Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [152, 184],
          y: CENTER,
          description: 'Upper level of the Grand Plaza atrium.',
          tags: ['Atrium'],
        }),
        venue(5, {
          id: 'v5-raw-on-5',
          positionConfidence: 'verified',
          name: 'Raw on 5',
          category: 'Fine Dining',
          color: C.dining,
          x: [152, 170],
          y: STBD_EDGE,
          description: 'Raw bar with oysters, crudo and sushi, beside the Magic Carpet.',
          tags: ['Seafood', 'Sushi'],
        }),
        venue(5, {
          id: 'v5-world-class-bar',
          positionConfidence: 'verified',
          name: 'World Class Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [170, 184],
          y: STBD_EDGE,
          description: 'Mixology bar — the first in the fleet, new on Xcel.',
          tags: ['Cocktails', 'New on Xcel'],
        }),
        magicCarpetStop(5, {
          positionConfidence: 'verified',
          name: 'Magic Carpet (Deck 5 Dining)',
          ...partOf('magic-carpet'),
          description: 'The cantilevered Magic Carpet docks on Deck 5 as an open-air extension of the dining venues.',
          tags: ['Cantilevered', 'Ocean Views', 'Starboard'],
        }),
        venue(5, {
          id: 'v5-blu',
          positionConfidence: 'verified',
          name: 'Blu',
          category: 'Fine Dining',
          color: C.dining,
          x: [200, 240],
          y: PORT_EDGE,
          description: 'Restaurant reserved for AquaClass guests, with a clean-eating menu.',
          tags: ['AquaClass', 'Healthy'],
        }),
        venue(5, {
          id: 'v5-fine-cut',
          positionConfidence: 'verified',
          name: 'Fine Cut Steakhouse',
          category: 'Fine Dining',
          color: C.dining,
          x: [200, 240],
          y: STBD_EDGE,
          description: 'Specialty steakhouse with prime cuts and panoramic views.',
          tags: ['Steakhouse', 'Specialty Dining'],
        }),
        venue(5, {
          id: 'v5-back-of-house',
          name: 'Galley',
          category: 'Crew & Service',
          color: C.backOfHouse,
          x: [200, 240],
          y: CENTER,
          description: 'Main galley. Crew only.',
          tags: ['Crew Only'],
        }),
        venue(5, {
          id: 'v5-attic',
          ...partOf('the-club', { aliases: ['The Attic'] }),
          positionConfidence: 'verified',
          name: 'The Attic at The Club',
          category: 'Entertainment',
          color: C.entertainment,
          x: [242, 260],
          y: PORT,
          description: 'Upper level of The Club with its own programming. New on Xcel.',
          tags: ['Nightlife', 'New on Xcel'],
        }),
        venue(5, {
          id: 'v5-bazaar-market',
          ...partOf('the-bazaar'),
          name: 'Market at The Bazaar',
          category: 'Casual Dining',
          color: C.dining,
          x: [276, 304],
          description: 'Market-style dining, crafts and festival entertainment on The Bazaar’s middle level.',
          tags: ['The Bazaar', 'New on Xcel'],
        }),
        venue(5, {
          id: 'v5-spice-cafe',
          ...partOf('the-bazaar', { aliases: ['Spice Cafe'] }),
          name: 'Spice Café',
          category: 'Casual Dining',
          color: C.dining,
          x: [306, 327],
          description: 'Casual café in The Bazaar with two outdoor seating areas.',
          tags: ['The Bazaar', 'New on Xcel'],
        }),
      ],
    })
  );

  // Deck 6 — staterooms; The Bazaar's upper level aft.
  decks.push(
    deck(6, {
      title: 'Staterooms & The Bazaar',
      category: 'Accommodations',
      description:
        'Panoramic Oceanview staterooms forward, Edge Singles and Infinite Veranda staterooms, Magic Carpet Sky Suites, and the upper level of The Bazaar aft.',
      venues: [
        ...stateroomDeck(6, {
          range: [0, 280],
          transom: false,
          typeFor: ({ x, side, row }) => {
            if (row === 'inside') return 'I2';
            if (x < 50) return 'PO';
            if (side === 'Port' && x >= 200 && x < 240) return 'ES';
            return edgeVeranda(x);
          },
        }),
        venue(6, {
          id: 'v6-bazaar',
          ...partOf('the-bazaar', { aliases: ['The Bazaar'] }),
          positionConfidence: 'verified',
          name: 'The Bazaar (Upper Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [284, 327],
          description: 'Top level of the triple-height Bazaar: workshops, lessons and destination-inspired entertainment.',
          tags: ['The Bazaar', 'New on Xcel'],
        }),
      ],
    })
  );

  // Decks 7–10 — full-length stateroom decks with Sunset Verandas across the stern.
  const midDeckTypes = {
    7: ({ x }) => (x < 50 ? 'DO' : edgeVeranda(x)),
    8: ({ x }) => (x < 45 ? 'DO' : x < 81 ? 'A1' : edgeVeranda(x)),
    9: ({ x }) => (x < 45 ? 'DO' : x < 81 ? 'A1' : x < 120 && x >= 95 ? 'S1' : x < 186 && x >= 95 ? 'C2' : edgeVeranda(x)),
    10: ({ x }) =>
      x < 45 ? 'E3' : x < 70 ? 'A1' : x < 81 ? 'AS' : x < 120 && x >= 95 ? 'S1' : x < 186 && x >= 95 ? 'C2' : edgeVeranda(x),
  };
  const midDeckInfo = {
    7: 'Deluxe Oceanview staterooms forward, Prime Edge and Edge Infinite Veranda staterooms, and Sunset Verandas facing the wake.',
    8: 'AquaClass staterooms forward, Edge Infinite Veranda staterooms, and Sunset Verandas and Sunset Sky Suites aft.',
    9: 'AquaClass forward, Sky Suites and Concierge Class midship, Edge Infinite Veranda staterooms, and Sunset Verandas aft.',
    10: 'AquaClass and the new AquaClass Sky Suites forward, Sky Suites and Concierge Class midship, and Sunset Verandas aft.',
  };
  for (const level of [7, 8, 9, 10]) {
    decks.push(
      deck(level, {
        title: 'Staterooms',
        category: 'Accommodations',
        description: midDeckInfo[level],
        venues: stateroomDeck(level, {
          range: [0, 319],
          typeFor: ({ x, row }) => (row === 'inside' ? 'I2' : midDeckTypes[level]({ x })),
        }),
      })
    );
  }

  // Deck 11 — navigation bridge forward, suites and Concierge Class.
  decks.push(
    deck(11, {
      title: 'Bridge, Suites & Concierge',
      category: 'Accommodations',
      description:
        'The navigation bridge (crew only) forward, Celebrity Suites and Sky Suites, Concierge Class staterooms midship, and Sunset Verandas aft.',
      venues: [
        venue(11, {
          id: 'v11-bridge',
          name: 'Navigation Bridge',
          category: 'Navigation & Bridge',
          color: C.service,
          x: [18, 42],
          description: 'The ship’s navigation bridge, with wings overhanging both sides. Crew only.',
          tags: ['Bridge', 'Crew Only'],
        }),
        ...stateroomDeck(11, {
          range: [44, 319],
          typeFor: ({ x, row }) => {
            if (row === 'inside') return x < 81 ? null : 'I2';
            if (x < 81) return 'CS';
            if (x >= 95 && x < 120) return 'S1';
            if (x >= 95 && x < 186) return 'C2';
            return edgeVeranda(x);
          },
        }),
      ],
    })
  );

  // Deck 12 — Iconic Suites above the bridge, Royal and Penthouse Suites forward.
  const iconic = (side, y) => ({
    code: 'IC',
    side,
    row: 'outside',
    bounds: clampToHull(12, [26, 46], y),
  });
  decks.push(
    deck(12, {
      title: 'Iconic Suites & Suite Class',
      category: 'Luxury Accommodations',
      description:
        'The two Iconic Suites above the navigation bridge, Royal Suites forward to port and Penthouse Suites forward to starboard, Celebrity Suites, Sky Suites, Concierge Class and Sunset Verandas.',
      venues: stateroomDeck(12, {
        range: [48, 319],
        fixedCabins: [iconic('Port', PORT), iconic('Starboard', STBD)],
        typeFor: ({ x, side, row }) => {
          if (row === 'inside') return x < 81 ? null : 'I2';
          if (x < 60) return side === 'Port' ? 'RS' : 'PS';
          if (x < 81) return 'CS';
          if (x < 120) return 'S1';
          if (x < 186) return 'C2';
          return edgeVeranda(x);
        },
      }),
    })
  );

  // Deck 14 — spa forward, Solarium, Celebrity Pool Club, Oceanview Café aft.
  decks.push(
    deck(14, {
      title: 'Pool Deck, Spa & Oceanview Café',
      category: 'Pools & Recreation',
      description:
        'The Spa and SEA Thermal Suite forward, the adults-only Solarium, the Celebrity Pool Club resort deck with martini-glass hot tubs and cabanas, the Magic Carpet’s pool-deck stop, and Oceanview Café aft.',
      venues: [
        venue(14, {
          id: 'v14-spa',
          name: 'The Spa & SEA Thermal Suite',
          category: 'Spa & Wellness',
          color: C.spa,
          x: [36, 80],
          description: 'Full-service spa with the SEA Thermal Suite, including the new Hydra Room, salon and Spa Café.',
          tags: ['Spa', 'Thermal Suite', 'Hydra Room'],
        }),
        ...generateCenterlineCore(14),
        venue(14, {
          id: 'v14-solarium',
          positionConfidence: 'verified',
          name: 'Solarium',
          category: 'Pool & Sun Deck',
          color: C.pool,
          x: [96, 134],
          description: 'Adults-only, glass-roofed pool retreat with a pool and two hot tubs.',
          tags: ['Adults Only', 'Indoor Pool'],
        }),
        venue(14, {
          id: 'v14-pool-club',
          aliases: ['Pool Deck', 'Resort Deck', 'Main Pool'],
          positionConfidence: 'verified',
          name: 'Celebrity Pool Club',
          category: 'Pool & Sun Deck',
          color: C.pool,
          x: [136, 184],
          y: [0, 28],
          description: 'Main resort deck with a 23 m lap pool, a giant LED screen and two-deck-high martini-glass hot tubs.',
          tags: ['Main Pool', 'Martini Glass Hot Tubs'],
        }),
        venue(14, {
          id: 'v14-cabanas',
          name: 'Pool Club Cabanas',
          category: 'Pool & Sun Deck',
          color: C.pool,
          x: [136, 184],
          y: [29, 39],
          description: 'Rentable cabanas on the starboard side, fronting the Magic Carpet.',
          tags: ['Cabanas', 'Starboard'],
        }),
        magicCarpetStop(14, {
          name: 'Magic Carpet (Pool Deck)',
          ...partOf('magic-carpet'),
          description: 'On Deck 14 the Magic Carpet extends the pool deck out over the sea, in front of the cabanas.',
          tags: ['Pool Deck', 'Starboard'],
        }),
        venue(14, {
          id: 'v14-mast-grill',
          positionConfidence: 'estimated', // sources conflict: Deck 14 vs Deck 16
          name: 'Mast Grill & Bar',
          category: 'Casual Dining',
          color: C.dining,
          x: [200, 214],
          description: 'Poolside grill for burgers and hot dogs.',
          tags: ['Grill', 'Poolside'],
        }),
        venue(14, {
          id: 'v14-oceanview-cafe',
          aliases: ['OVC', 'Oceanview Cafe', 'Buffet'],
          positionConfidence: 'verified',
          name: 'Oceanview Café',
          category: 'Casual Dining',
          color: C.dining,
          x: [216, 260],
          description: 'Marketplace-style buffet with international stations.',
          tags: ['Buffet'],
        }),
        venue(14, {
          id: 'v14-il-secondo-bacio',
          name: 'Il Secondo Bacio',
          category: 'Casual Dining',
          color: C.dining,
          x: [276, 292],
          y: PORT,
          description: 'Gelato and coffee bar beside Oceanview Café.',
          tags: ['Gelato', 'Coffee'],
        }),
        venue(14, {
          id: 'v14-cafe-terrace',
          aliases: ['Oceanview Cafe Terrace'],
          positionConfidence: 'estimated', // not in any published source
          name: 'Oceanview Café Terrace',
          category: 'Casual Dining',
          color: C.dining,
          x: [276, 312],
          y: STBD,
          description: 'Outdoor seating overlooking the wake.',
          tags: ['Al Fresco'],
        }),
        venue(14, {
          id: 'v14-aft-sundeck',
          positionConfidence: 'estimated', // not in any published source
          name: 'Aft Sun Deck',
          category: 'Pool & Sun Deck',
          color: C.pool,
          x: [294, 312],
          y: PORT,
          description: 'Open deck loungers at the stern.',
          tags: ['Sun Deck'],
        }),
      ],
    })
  );

  // Deck 15 — Edge Villas and The Retreat Lounge forward, fitness, Rooftop Garden, Sunset Bar aft.
  const villa = (number, side, x) => ({
    code: 'EV',
    number,
    side,
    row: 'outside',
    bounds: clampToHull(15, x, side === 'Port' ? PORT : STBD),
  });
  decks.push(
    deck(15, {
      title: 'The Retreat, Rooftop Garden & Sunset Bar',
      category: 'Outdoor & Panoramic Views',
      description:
        'Edge Villas and the suites-only Retreat Lounge forward, the Fitness Center, Bora, the Rooftop Garden and Grill, and the doubled-in-size Sunset Bar at the stern.',
      venues: [
        ...generateStaterooms(15, {
          range: [0, 0],
          typeFor: () => null,
          fixedCabins: [
            villa(15100, 'Port', [42, 61]),
            villa(15102, 'Port', [61, 80]),
            villa(15104, 'Starboard', [42, 61]),
            villa(15106, 'Starboard', [61, 80]),
          ],
        }),
        ...generateCenterlineCore(15),
        venue(15, {
          id: 'v15-retreat-lounge',
          name: 'The Retreat Lounge',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [96, 134],
          description: 'Enlarged private lounge for suite guests with complimentary drinks and a dedicated concierge.',
          tags: ['The Retreat', 'Suite Guests Only'],
        }),
        venue(15, {
          id: 'v15-fitness',
          positionConfidence: 'verified',
          name: 'Fitness Center',
          category: 'Spa & Wellness',
          color: C.spa,
          x: [136, 184],
          y: PORT,
          description: 'Gym with cardio and weights plus Motion Studios A and B.',
          tags: ['Gym', 'Classes'],
        }),
        venue(15, {
          id: 'v15-spa',
          positionConfidence: 'verified',
          name: 'The Spa & Salon',
          category: 'Spa & Wellness',
          color: C.spa,
          x: [136, 184],
          y: STBD,
          description: 'Upper level of The Spa with salon, barbershop and relaxation spaces.',
          tags: ['Spa', 'Salon'],
        }),
        venue(15, {
          id: 'v15-bora',
          positionConfidence: 'estimated', // Celebrity's plan labels it aft of the Rooftop Garden
          name: 'Bora',
          category: 'Fine Dining',
          color: C.dining,
          x: [200, 224],
          y: PORT,
          description: 'Open-air Mediterranean restaurant. New on Xcel.',
          tags: ['Mediterranean', 'Open Air', 'New on Xcel'],
        }),
        venue(15, {
          id: 'v15-oceanview-upper',
          aliases: ['Oceanview Cafe (Upper Seating)', 'Oceanview Cafe Upper', 'Oceanview Upper'],
          positionConfidence: 'verified',
          name: 'Oceanview Café (Upper Seating)',
          category: 'Casual Dining',
          color: C.dining,
          x: [200, 224],
          y: STBD,
          description: 'Upper level seating and outdoor terrace for Oceanview Café overlooking the stern.',
          tags: ['Buffet', 'Outdoor Seating'],
        }),
        venue(15, {
          id: 'v15-rooftop-garden',
          positionConfidence: 'verified',
          name: 'Rooftop Garden',
          category: 'Outdoor & Recreation',
          color: C.pool,
          x: [226, 260],
          description: 'Expanded garden lounge with the Rooftop Garden Grill, pickleball and evening movies.',
          tags: ['Garden', 'Grill', 'Movies'],
        }),
        venue(15, {
          id: 'v15-sunset-bar',
          positionConfidence: 'verified',
          name: 'Sunset Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [276, 318],
          description: 'Open-air bar at the stern, twice the size of the Edge-class original, with wake views.',
          tags: ['Wake Views', 'Cocktails'],
        }),
      ],
    })
  );

  // Deck 16 — Edge Villa terraces, Retreat lower sundeck, Luminae, Magic Carpet's top stop.
  decks.push(
    deck(16, {
      title: 'Luminae & Retreat Sundeck',
      category: 'The Retreat',
      description:
        'Edge Villa upper levels and plunge-pool terraces, the Retreat’s lower sundeck above the Solarium, Luminae at The Retreat, glass-walled hot tubs, the Magic Carpet’s “Dinner on the Edge” stop, and Mast Bar.',
      venues: [
        venue(16, {
          id: 'v16-villa-terraces-port',
          name: 'Edge Villa Terraces (Port)',
          category: 'Edge Villas',
          color: C.edgeVilla,
          x: [48, 80],
          y: PORT,
          description: 'Upper levels and private plunge-pool terraces of the port-side Edge Villas.',
          tags: ['Edge Villas', 'Plunge Pool'],
        }),
        venue(16, {
          id: 'v16-villa-terraces-stbd',
          name: 'Edge Villa Terraces (Starboard)',
          category: 'Edge Villas',
          color: C.edgeVilla,
          x: [48, 80],
          y: STBD,
          description: 'Upper levels and private plunge-pool terraces of the starboard Edge Villas.',
          tags: ['Edge Villas', 'Plunge Pool'],
        }),
        ...generateCenterlineCore(16),
        venue(16, {
          id: 'v16-retreat-lower-sundeck',
          positionConfidence: 'verified',
          name: 'Retreat Lower Sundeck',
          category: 'Pool & Sun Deck',
          color: C.pool,
          x: [96, 134],
          description: 'Suites-only sundeck above the Solarium.',
          tags: ['The Retreat', 'Suite Guests Only'],
        }),
        venue(16, {
          id: 'v16-luminae',
          positionConfidence: 'verified',
          name: 'Luminae at The Retreat',
          category: 'Fine Dining',
          color: C.dining,
          x: [136, 184],
          y: [0, 24],
          description: 'Redesigned restaurant exclusively for suite guests.',
          tags: ['The Retreat', 'Suite Guests Only'],
        }),
        venue(16, {
          id: 'v16-hot-tubs',
          name: 'Glass-Walled Hot Tubs',
          category: 'Pool & Sun Deck',
          color: C.pool,
          x: [136, 184],
          y: [25, 39],
          description: 'Two cantilevered, glass-walled hot tubs midship.',
          tags: ['Hot Tubs'],
        }),
        magicCarpetStop(16, {
          name: 'Magic Carpet (Dinner on the Edge)',
          ...partOf('magic-carpet'),
          description: 'The Magic Carpet’s highest stop, used for “Dinner on the Edge” and sail-away events.',
          tags: ['Dinner on the Edge', 'Starboard'],
        }),
        venue(16, {
          id: 'v16-mast-grill',
          positionConfidence: 'verified',
          name: 'Mast Grill',
          category: 'Casual Dining',
          color: C.dining,
          x: [200, 250],
          y: PORT,
          description: 'Poolside grill for burgers and hot dogs, overlooking the pool deck.',
          tags: ['Grill', 'Poolside'],
        }),
        venue(16, {
          id: 'v16-mast-bar',
          positionConfidence: 'verified',
          name: 'Mast Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [200, 250],
          y: STBD,
          description: 'Top-deck bar beside the jogging track.',
          tags: ['Bar', 'Jogging Track'],
        }),
      ],
    })
  );

  // Deck 17 — The Retreat Sundeck.
  decks.push(
    deck(17, {
      title: 'The Retreat Sundeck',
      category: 'The Retreat',
      description: 'The suites-only Retreat Sundeck with a round pool, two cantilevered plunge pools, cabanas and The Retreat Bar.',
      venues: [
        ...generateCenterlineCore(17, ['fwd']),
        venue(17, {
          id: 'v17-retreat-sundeck',
          positionConfidence: 'verified',
          name: 'The Retreat Sundeck',
          category: 'Pool & Sun Deck',
          color: C.pool,
          x: [96, 150],
          description: 'Round pool, two cantilevered plunge pools, cabanas and premium loungers for suite guests.',
          tags: ['The Retreat', 'Suite Guests Only', 'Pool'],
        }),
        venue(17, {
          id: 'v17-retreat-bar',
          positionConfidence: 'estimated', // Celebrity's plan labels it forward of the elevators
          name: 'The Retreat Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [152, 176],
          description: 'Poolside bar for Retreat guests.',
          tags: ['The Retreat', 'Suite Guests Only'],
        }),
      ],
    })
  );

  return decks;
}
