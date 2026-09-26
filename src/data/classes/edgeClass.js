/**
 * Parametric deck generator for Edge-Class cruise ships.
 *
 * Supports both:
 * - Stretched 327m hull (Celebrity Xcel, Celebrity Ascent, Celebrity Beyond)
 * - Original 306m hull (Celebrity Apex, Celebrity Edge)
 *
 * For Celebrity Xcel, delegates directly to generateAllDecks() from
 * celebrityXcelFullDeckGenerator.js to guarantee 100% byte/hash stability.
 *
 * For sister ships, parametrically configures hull geometry, deck envelopes,
 * cabin ranges, and ship-specific venue configurations (Eden vs The Bazaar,
 * Le Voyage, The Annex, Bora, Casino Bar vs Craft Social, Luminae placement,
 * and Retreat layout).
 */

import { generateAllDecks as generateXcelDecks } from '../celebrityXcelFullDeckGenerator.js';
import {
  createHullPipeline,
  CORE_STATIONS,
  MAGIC_CARPET_X,
  VENUE_COLORS as C,
} from '../../utils/deckPlanDataPipeline.js';

// Across-ship bands (y, metres from port hull)
const PORT = [0, 19.3];
const STBD = [19.7, 39];
const PORT_EDGE = [0, 11.5];
const STBD_EDGE = [27.5, 39];
const CENTER = [12, 27];

/**
 * Multi-deck venue groups and their deck spans and aliases.
 */
function getVenueGroups(hasEden) {
  const groups = {
    theatre: { spansDecks: [3, 4, 5], aliases: ['The Theatre', 'The Theater', 'Theatre', 'Theater'] },
    'grand-plaza': { spansDecks: [3, 4, 5], aliases: ['Grand Plaza', 'Grand Plaza Bar'] },
    'the-club': { spansDecks: [4, 5], aliases: [] },
    'magic-carpet': { spansDecks: [2, 5, 14, 16], aliases: ['Magic Carpet', 'Magic Carpet Bar'] },
  };

  if (hasEden) {
    groups.eden = { spansDecks: [4, 5, 6], aliases: ['Eden'] };
  } else {
    groups['the-bazaar'] = { spansDecks: [4, 5, 6], aliases: [] };
  }

  return groups;
}

/** Standard mid/aft veranda cabin, with Prime Edge through midship section */
const edgeVeranda = (x) => (x >= 95 && x < 186 ? 'E1' : 'E3');

/** Magic Carpet Sky Suite directly forward of the platform's starboard track */
const nextToMagicCarpet = ({ x, side, row }) => side === 'Starboard' && row === 'outside' && x >= 144 && x < 154;

/**
 * Generates all decks for an Edge-class ship given its manifest.
 *
 * @param {object} manifest Ship manifest (loaded from src/data/ships/<shipId>/manifest.json)
 * @returns {Array<object>} Array of deck objects with level, name, title, shapeCoordinates, and venues.
 */
export function generateEdgeClassDecks(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('generateEdgeClassDecks requires a valid manifest');
  }

  // Exact parity for Celebrity Xcel to preserve 100% test & routing fixture stability
  if (manifest.shipId === 'celebrity-xcel') {
    return generateXcelDecks();
  }

  const lengthMeters = manifest.lengthMeters ?? 327;
  const beamMeters = manifest.beamMeters ?? 39;
  const pipeline = createHullPipeline({ lengthMeters, beamMeters });

  const {
    clampToHull,
    placeVenue,
    generateHullOutline,
    generateCenterlineCore,
    generateServiceStrips,
    generateStaterooms,
    magicCarpetStop,
    sternStairX,
  } = pipeline;

  const STERN_STAIR_X = sternStairX;
  const CORES = [CORE_STATIONS.fwd.x, CORE_STATIONS.mid.x, CORE_STATIONS.aft.x];

  const venueNames = new Set((manifest.venues || []).map((v) => v.name));
  const hasVenue = (name) => venueNames.has(name);
  const hasEden = hasVenue('Eden Restaurant') || hasVenue('Eden Bar');
  const hasLeVoyage = hasVenue('Le Voyage by Daniel Boulud');
  const hasAnnex = hasVenue('The Annex');
  const hasCasinoBar = hasVenue('Casino Bar');
  const hasBora = hasVenue('Bora');
  const hasDeck12Luminae = (manifest.venues || []).some((v) => v.deck === 12 && v.name.includes('Luminae'));
  const isStretched = lengthMeters >= 320;
  const hasDeck17 = isStretched && (manifest.deckRange ? manifest.deckRange.max >= 17 : true);

  const venueGroups = getVenueGroups(hasEden);
  const partOf = (groupName, { aliases = [] } = {}) => {
    const grp = venueGroups[groupName];
    if (!grp) return { aliases };
    return {
      venueGroup: groupName,
      spansDecks: grp.spansDecks,
      aliases: [...grp.aliases, ...aliases],
    };
  };

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
      cabinRanges: cabinRanges ?? manifest.cabinRanges?.[String(level)],
    });
    return [
      ...generateCenterlineCore(level, ['fwd', 'mid', 'aft', ...(transom ? ['stern'] : []), ...extraBanks]),
      ...generateServiceStrips(level, { range, avoid }),
      ...cabins,
    ];
  }

  const decks = [];

  // ---------------------------------------------------------------- Deck 2
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
          aliases: ['Medical Clinic'],
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
          access: 'kids',
          aliases: ['Teen Club'],
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
          portExit: 'gangway',
          aliases: ['Gangway', 'Security Screening', 'Disembarkation'],
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
          // "Tender Platform" is the Magic Carpet beside it, where the tenders are boarded.
          aliases: ['Tender Boarding'],
        }),
        magicCarpetStop(2, {
          name: 'Magic Carpet (Tender Platform)',
          ...partOf('magic-carpet', { aliases: ['Tender Platform'] }),
          description: 'At Deck 2 the Magic Carpet becomes a tender embarkation platform for Destination Gateway.',
          tags: ['Tender Platform', 'Starboard'],
          // Guests wait in Destination Gateway and board the tenders from here.
          portExit: 'tender',
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
          x: isStretched ? [276, 322] : [276, 304],
          description: 'Provision and galley stores. Crew only.',
          tags: ['Crew Only'],
          hideLabel: true,
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 3
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
          cabinRanges: manifest.cabinRanges?.['3'],
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
          positionConfidence: 'estimated',
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
          positionConfidence: 'estimated',
          name: 'Shore Excursions',
          category: 'Guest Services',
          color: C.service,
          x: [200, 224],
          y: [0, 17],
          description: 'Book and manage shore excursions.',
          tags: ['Excursions'],
          aliases: ['Shore Ex'],
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
          aliases: ['Guest Services', 'Reception'],
        }),
        venue(3, {
          id: 'v3-camp-at-sea',
          positionConfidence: 'estimated',
          name: 'Camp at Sea',
          category: 'Kids & Teens',
          color: C.entertainment,
          x: [226, 260],
          y: [0, 17],
          description: 'Kids club with age-grouped activities.',
          tags: ['Kids'],
          access: 'kids',
          aliases: ['Kids Club'],
        }),
        venue(3, {
          id: 'v3-concierge-lounge',
          positionConfidence: 'estimated',
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
          x: isStretched ? [276, 325] : [276, 304],
          y: PORT,
          description: 'Complimentary main restaurant serving French-inspired cuisine.',
          tags: ['Main Dining', 'French'],
          aliases: ['Normandie'],
        }),
        venue(3, {
          id: 'v3-tuscan',
          positionConfidence: 'verified',
          name: 'Tuscan Restaurant',
          category: 'Fine Dining',
          color: C.dining,
          x: isStretched ? [276, 325] : [276, 304],
          y: STBD,
          description: 'Complimentary main restaurant serving Italian dishes.',
          tags: ['Main Dining', 'Italian'],
          aliases: ['Tuscan'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 4
  const deck4Venues = [
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
  ];

  if (hasLeVoyage) {
    deck4Venues.push(
      venue(4, {
        id: 'v4-photo',
        name: 'Photo Gallery & Studio',
        category: 'Shopping & Galleries',
        color: C.shopping,
        x: [96, 124],
        y: PORT,
        description: 'Portrait studio and photo gallery.',
        tags: ['Photos'],
        aliases: ['Photo Gallery'],
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
        aliases: ['The Shops'],
      }),
      venue(4, {
        id: 'v4-le-voyage',
        positionConfidence: 'verified',
        name: 'Le Voyage by Daniel Boulud',
        category: 'Fine Dining',
        color: C.dining,
        x: [126, 150],
        y: PORT,
        description: 'Specialty restaurant with a globe-trotting menu by Chef Daniel Boulud.',
        tags: ['Specialty Dining', 'Daniel Boulud'],
        aliases: ['Le Voyage'],
      })
    );
  } else {
    deck4Venues.push(
      venue(4, {
        id: 'v4-photo',
        name: 'Photo Gallery & Studio',
        category: 'Shopping & Galleries',
        color: C.shopping,
        x: [96, 150],
        y: PORT,
        description: 'Portrait studio and photo gallery.',
        tags: ['Photos'],
        aliases: ['Photo Gallery'],
      }),
      venue(4, {
        id: 'v4-shops',
        name: 'Celebrity Shops',
        category: 'Shopping & Galleries',
        color: C.shopping,
        x: [96, 150],
        y: STBD,
        description: 'Duty-free boutiques, jewelry and watches.',
        tags: ['Shopping'],
        aliases: ['The Shops'],
      })
    );
  }

  deck4Venues.push(
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
      aliases: ['Cafe al Bacio', 'Il Bacio'],
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
      aliases: ['The Casino', 'Celebrity Casino'],
    })
  );

  if (hasCasinoBar) {
    deck4Venues.push(
      venue(4, {
        id: 'v4-casino-bar',
        positionConfidence: 'verified',
        name: 'Casino Bar',
        category: 'Bars & Lounges',
        color: C.bar,
        x: [242, 260],
        y: STBD,
        description: 'Bar serving the casino floor with cocktails and beers on tap.',
        tags: ['Casino Bar', 'Cocktails'],
        aliases: ['Casino Bar'],
      })
    );
  } else {
    deck4Venues.push(
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
        aliases: ['Craft Social Bar'],
      })
    );
  }

  deck4Venues.push(
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
      x: isStretched ? [276, 296] : [276, 288],
      y: PORT,
      description: 'Complimentary main restaurant with a contemporary menu.',
      tags: ['Main Dining'],
      aliases: ['Cosmopolitan'],
    }),
    venue(4, {
      id: 'v4-cyprus',
      positionConfidence: 'verified',
      name: 'Cyprus Restaurant',
      category: 'Fine Dining',
      color: C.dining,
      x: isStretched ? [276, 296] : [276, 288],
      y: STBD,
      description: 'Complimentary main restaurant with Greek and Mediterranean dishes.',
      tags: ['Main Dining', 'Mediterranean'],
      aliases: ['Cyprus'],
    })
  );

  if (hasEden) {
    deck4Venues.push(
      venue(4, {
        id: 'v4-eden-restaurant',
        ...partOf('eden', { aliases: ['Eden', 'Eden Restaurant'] }),
        positionConfidence: 'verified',
        name: 'Eden Restaurant',
        category: 'Fine Dining',
        color: C.dining,
        x: isStretched ? [298, 327] : [290, 306],
        y: [0, 39],
        description: 'Multi-level experiential dining with open kitchen and wake views.',
        tags: ['Eden', 'Specialty Dining'],
      })
    );
  }

  decks.push(
    deck(4, {
      title: hasEden ? 'Casino, Dining & Eden' : 'Casino, Dining & The Bazaar',
      category: 'Dining & Nightlife',
      description: hasEden
        ? 'The Theatre (middle level), Le Grand Bistro and Café al Bacio on the Grand Plaza, the Casino, The Club, Cosmopolitan and Cyprus restaurants, and Eden Restaurant aft.'
        : 'The Theatre (middle level), Le Grand Bistro and Café al Bacio on the Grand Plaza, the Casino, The Club, Cosmopolitan and Cyprus restaurants, and The Bazaar aft.',
      venues: deck4Venues,
    })
  );

  // ---------------------------------------------------------------- Deck 5
  const deck5Venues = [
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
      aliases: ['Park West Gallery'],
    }),
    venue(5, {
      id: 'v5-flagship-store',
      positionConfidence: 'estimated',
      name: 'Celebrity Flagship Store',
      category: 'Shopping & Galleries',
      color: C.shopping,
      x: [96, 114],
      y: STBD,
      description: 'Celebrity-branded boutique.',
      tags: ['Shopping'],
      aliases: ['Flagship Store'],
    }),
  ];

  if (hasAnnex) {
    deck5Venues.push(
      venue(5, {
        id: 'v5-annex',
        positionConfidence: 'estimated',
        name: 'The Annex',
        category: 'Bars & Lounges',
        color: C.bar,
        x: [116, 184],
        y: PORT_EDGE,
        description: 'Intimate lounge space.',
        tags: ['Lounge'],
        aliases: ['Annex'],
      }),
      venue(5, {
        id: 'v5-shops',
        positionConfidence: 'estimated',
        name: 'Boutiques',
        category: 'Shopping & Galleries',
        color: C.shopping,
        x: [116, 134],
        y: STBD,
        description: 'Luxury retail boutiques.',
        tags: ['Shopping'],
      })
    );
  } else {
    deck5Venues.push(
      venue(5, {
        id: 'v5-shops',
        positionConfidence: 'estimated',
        name: 'Boutiques',
        category: 'Shopping & Galleries',
        color: C.shopping,
        x: [116, 184],
        y: PORT_EDGE,
        description: 'Luxury retail boutiques.',
        tags: ['Shopping'],
      })
    );
  }

  deck5Venues.push(
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
      aliases: ['Raw on 5th', 'Sushi on 5'],
    }),
    venue(5, {
      id: 'v5-world-class-bar',
      positionConfidence: 'verified',
      name: 'World Class Bar',
      category: 'Bars & Lounges',
      color: C.bar,
      x: [170, 184],
      y: STBD_EDGE,
      description: 'Mixology bar serving craft cocktails.',
      tags: ['Cocktails'],
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
      aliases: ['Blu Restaurant'],
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
      aliases: ['Fine Cut'],
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
      ...partOf('the-club', { aliases: ['The Attic', 'The Club Upper'] }),
      positionConfidence: 'verified',
      name: 'The Attic at The Club',
      category: 'Entertainment',
      color: C.entertainment,
      x: [242, 260],
      y: PORT,
      description: 'Upper level of The Club with its own programming.',
      tags: ['Nightlife'],
    })
  );

  if (hasEden) {
    deck5Venues.push(
      venue(5, {
        id: 'v5-eden-bar',
        ...partOf('eden', { aliases: ['Eden', 'Eden Bar', 'Eden Lounge'] }),
        positionConfidence: 'verified',
        name: 'Eden Bar',
        category: 'Bars & Lounges',
        color: C.bar,
        x: isStretched ? [276, 327] : [276, 306],
        y: [0, 39],
        description: 'Cocktails and entertainment in the lush, plant-filled three-deck Eden space.',
        tags: ['Eden', 'Cocktails', 'Live Music'],
      })
    );
  }

  decks.push(
    deck(5, {
      title: hasEden ? 'Grand Plaza, Dining & Eden' : 'Grand Plaza, Dining & Magic Carpet',
      category: 'Culinary & Iconic Features',
      description: hasEden
        ? 'The Theatre (upper level), Fine Cut Steakhouse, Raw on 5, World Class Bar and Blu around the upper Grand Plaza, the Magic Carpet dining stop, and Eden Bar aft.'
        : 'The Theatre (upper level), Fine Cut Steakhouse, Raw on 5, World Class Bar and Blu around the upper Grand Plaza, and the Magic Carpet dining stop.',
      venues: deck5Venues,
    })
  );

  // ---------------------------------------------------------------- Deck 6
  const deck6Venues = [
    ...stateroomDeck(6, {
      range: isStretched ? [0, 280] : [0, 276],
      transom: false,
      typeFor: ({ x, side, row }) => {
        if (row === 'inside') return 'I2';
        if (x < 50) return 'PO';
        if (side === 'Port' && x >= 200 && x < 240) return 'ES';
        return edgeVeranda(x);
      },
      cabinRanges: manifest.cabinRanges?.['6'],
    }),
  ];

  if (hasEden) {
    deck6Venues.push(
      venue(6, {
        id: 'v6-eden',
        ...partOf('eden', { aliases: ['Eden', 'Eden Walkway'] }),
        positionConfidence: 'verified',
        name: 'Eden (Upper Level)',
        category: 'Entertainment',
        color: C.entertainment,
        x: isStretched ? [284, 327] : [282, 306],
        y: [0, 39],
        description: 'Top level of Eden with open seating, living library and wake views.',
        tags: ['Eden', 'Entertainment'],
      })
    );
  }

  decks.push(
    deck(6, {
      title: hasEden ? 'Staterooms & Eden' : 'Staterooms & The Bazaar',
      category: 'Accommodations',
      description:
        'Panoramic Oceanview staterooms forward, Edge Singles and Infinite Veranda staterooms, Magic Carpet Sky Suites, and the upper level of the aft venue.',
      venues: deck6Venues,
    })
  );

  // ---------------------------------------------------------------- Decks 7–10
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
  const stateroomAftLimit = isStretched ? 319 : 298;

  for (const level of [7, 8, 9, 10]) {
    decks.push(
      deck(level, {
        title: 'Staterooms',
        category: 'Accommodations',
        description: midDeckInfo[level],
        venues: stateroomDeck(level, {
          range: [0, stateroomAftLimit],
          typeFor: ({ x, row }) => (row === 'inside' ? 'I2' : midDeckTypes[level]({ x })),
          cabinRanges: manifest.cabinRanges?.[String(level)],
        }),
      })
    );
  }

  // ---------------------------------------------------------------- Deck 11
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
          aliases: ['The Bridge', 'Bridge'],
        }),
        ...stateroomDeck(11, {
          range: [44, stateroomAftLimit],
          typeFor: ({ x, row }) => {
            if (row === 'inside') return x < 81 ? null : 'I2';
            if (x < 81) return 'CS';
            if (x >= 95 && x < 120) return 'S1';
            if (x >= 95 && x < 186) return 'C2';
            return edgeVeranda(x);
          },
          cabinRanges: manifest.cabinRanges?.['11'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 12
  const iconic = (side, y) => ({
    code: 'IC',
    side,
    row: 'outside',
    bounds: clampToHull(12, [26, 46], y),
  });

  const deck12Venues = [];
  if (hasDeck12Luminae) {
    deck12Venues.push(
      venue(12, {
        id: 'v12-luminae',
        positionConfidence: 'verified',
        name: 'Luminae',
        category: 'Fine Dining',
        color: C.dining,
        x: [48, 80],
        y: PORT,
        description: 'Exclusive restaurant for Retreat suite guests.',
        tags: ['The Retreat', 'Suite Guests Only'],
        access: 'suite',
        aliases: ['Luminae Restaurant'],
      })
    );
  }

  deck12Venues.push(
    ...stateroomDeck(12, {
      range: [48, stateroomAftLimit],
      fixedCabins: [iconic('Port', PORT), iconic('Starboard', STBD)],
      typeFor: ({ x, side, row }) => {
        if (hasDeck12Luminae && side === 'Port' && x < 81) return null;
        if (row === 'inside') return x < 81 ? null : 'I2';
        if (x < 60) return side === 'Port' ? 'RS' : 'PS';
        if (x < 81) return 'CS';
        if (x < 120) return 'S1';
        if (x < 186) return 'C2';
        return edgeVeranda(x);
      },
      cabinRanges: manifest.cabinRanges?.['12'],
    })
  );

  decks.push(
    deck(12, {
      title: 'Iconic Suites & Suite Class',
      category: 'Luxury Accommodations',
      description:
        'The two Iconic Suites above the navigation bridge, Royal Suites and Penthouse Suites forward, Celebrity Suites, Sky Suites, Concierge Class and Sunset Verandas.',
      venues: deck12Venues,
    })
  );

  // ---------------------------------------------------------------- Deck 14
  const deck14Venues = [
    venue(14, {
      id: 'v14-spa',
      name: 'The Spa & SEA Thermal Suite',
      category: 'Spa & Wellness',
      color: C.spa,
      x: [36, 80],
      description: 'Full-service spa with the SEA Thermal Suite, salon and Spa Café.',
      tags: ['Spa', 'Thermal Suite'],
      aliases: ['The Spa', 'SEA Thermal Suite'],
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
      access: 'adults',
      aliases: ['Adults Pool', 'Solarium Pool'],
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
      description: 'Main resort deck with a lap pool, giant LED screen and martini-glass hot tubs.',
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
      access: 'paid',
      aliases: ['Cabanas'],
    }),
    magicCarpetStop(14, {
      name: 'Magic Carpet (Pool Deck)',
      ...partOf('magic-carpet'),
      description: 'On Deck 14 the Magic Carpet extends the pool deck out over the sea, in front of the cabanas.',
      tags: ['Pool Deck', 'Starboard'],
    }),
    venue(14, {
      id: 'v14-mast-grill',
      positionConfidence: 'estimated',
      name: 'Mast Grill & Bar',
      category: 'Casual Dining',
      color: C.dining,
      x: [200, 214],
      description: 'Poolside grill for burgers and hot dogs.',
      tags: ['Grill', 'Poolside'],
      aliases: ['Mast Grill', 'Mast Bar'],
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
      x: isStretched ? [276, 292] : [276, 284],
      y: PORT,
      description: 'Gelato and coffee bar beside Oceanview Café.',
      tags: ['Gelato', 'Coffee'],
    }),
    venue(14, {
      id: 'v14-cafe-terrace',
      aliases: ['Oceanview Cafe Terrace', 'Oceanview Terrace'],
      positionConfidence: 'estimated',
      name: 'Oceanview Café Terrace',
      category: 'Casual Dining',
      color: C.dining,
      x: isStretched ? [276, 312] : [276, 292],
      y: STBD,
      description: 'Outdoor seating overlooking the wake.',
      tags: ['Al Fresco'],
    }),
    venue(14, {
      id: 'v14-aft-sundeck',
      positionConfidence: 'estimated',
      name: 'Aft Sun Deck',
      category: 'Pool & Sun Deck',
      color: C.pool,
      x: isStretched ? [294, 312] : [286, 292],
      y: PORT,
      description: 'Open deck loungers at the stern.',
      tags: ['Sun Deck'],
    }),
  ];

  decks.push(
    deck(14, {
      title: 'Pool Deck, Spa & Oceanview Café',
      category: 'Pools & Recreation',
      description:
        'The Spa forward, Solarium, Celebrity Pool Club, the Magic Carpet pool-deck stop, and Oceanview Café aft.',
      venues: deck14Venues,
    })
  );

  // ---------------------------------------------------------------- Deck 15
  const villa = (number, side, x) => ({
    code: 'EV',
    number,
    side,
    row: 'outside',
    bounds: clampToHull(15, x, side === 'Port' ? PORT : STBD),
  });

  const deck15Venues = [
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
      description: 'Enlarged private lounge for suite guests with complimentary drinks and dedicated concierge.',
      tags: ['The Retreat', 'Suite Guests Only'],
      access: 'suite',
      aliases: ['Retreat Lounge'],
    }),
    venue(15, {
      id: 'v15-fitness',
      positionConfidence: 'verified',
      name: 'Fitness Center',
      category: 'Spa & Wellness',
      color: C.spa,
      x: [136, 184],
      y: PORT,
      description: 'Gym with cardio and weights plus Motion Studios.',
      tags: ['Gym', 'Classes'],
      aliases: ['Gym', 'Fitness Centre'],
    }),
    venue(15, {
      id: 'v15-spa',
      positionConfidence: 'verified',
      name: 'The Spa & Salon',
      category: 'Spa & Wellness',
      color: C.spa,
      x: [136, 184],
      y: STBD,
      description: 'Upper level of The Spa with salon and relaxation spaces.',
      tags: ['Spa', 'Salon'],
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
      description: 'Upper level seating and outdoor terrace for Oceanview Café.',
      tags: ['Buffet', 'Outdoor Seating'],
    }),
    venue(15, {
      id: 'v15-rooftop-garden',
      positionConfidence: 'verified',
      name: 'Rooftop Garden',
      category: 'Outdoor & Recreation',
      color: C.pool,
      x: isStretched ? [226, 260] : [226, 256],
      description: 'Garden lounge with the Rooftop Garden Grill and evening movies.',
      tags: ['Garden', 'Grill', 'Movies'],
      aliases: ['Rooftop Garden Grill'],
    }),
    venue(15, {
      id: 'v15-sunset-bar',
      positionConfidence: 'verified',
      name: 'Sunset Bar',
      category: 'Bars & Lounges',
      color: C.bar,
      x: isStretched ? [276, 318] : [276, 296],
      description: 'Open-air bar at the stern with wake views.',
      tags: ['Wake Views', 'Cocktails'],
      aliases: ['Sunset Bar'],
    }),
  ];

  if (hasBora) {
    deck15Venues.push(
      venue(15, {
        id: 'v15-bora',
        positionConfidence: 'estimated',
        name: 'Bora',
        category: 'Fine Dining',
        color: C.dining,
        x: [200, 224],
        y: PORT,
        description: 'Open-air Mediterranean restaurant.',
        tags: ['Mediterranean', 'Open Air'],
      })
    );
  }

  decks.push(
    deck(15, {
      title: 'The Retreat, Rooftop Garden & Sunset Bar',
      category: 'Outdoor & Panoramic Views',
      description:
        'Edge Villas and suites-only Retreat Lounge forward, Fitness Center, Rooftop Garden, and Sunset Bar at the stern.',
      venues: deck15Venues,
    })
  );

  // ---------------------------------------------------------------- Deck 16
  const deck16Venues = [
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
  ];

  if (isStretched) {
    deck16Venues.push(
      venue(16, {
        id: 'v16-retreat-lower-sundeck',
        positionConfidence: 'verified',
        name: 'Retreat Lower Sundeck',
        category: 'Pool & Sun Deck',
        color: C.pool,
        x: [96, 134],
        description: 'Suites-only sundeck above the Solarium.',
        tags: ['The Retreat', 'Suite Guests Only'],
        access: 'suite',
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
        access: 'suite',
        aliases: ['Luminae'],
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
        description: 'The Magic Carpet’s highest stop, used for “Dinner on the Edge” and events.',
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
        description: 'Poolside grill overlooking the pool deck.',
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
      })
    );
  } else {
    // 306m hull: Apex & Edge layout
    deck16Venues.push(
      venue(16, {
        id: 'v16-retreat-sundeck',
        positionConfidence: 'verified',
        name: 'The Retreat Sundeck',
        category: 'Pool & Sun Deck',
        color: C.pool,
        x: [96, 134],
        description: 'Suites-only sundeck above the Solarium.',
        tags: ['The Retreat', 'Suite Guests Only'],
        access: 'suite',
        aliases: ['Retreat Sundeck'],
      }),
      venue(16, {
        id: 'v16-retreat-pool',
        positionConfidence: 'verified',
        name: 'The Retreat Pool',
        category: 'Pool & Sun Deck',
        color: C.pool,
        x: [136, 160],
        y: [10, 29],
        description: 'Dedicated pool for suite guests.',
        tags: ['The Retreat', 'Suite Guests Only', 'Pool'],
        access: 'suite',
      }),
      magicCarpetStop(16, {
        name: 'Magic Carpet (Dinner on the Edge)',
        ...partOf('magic-carpet'),
        description: 'The Magic Carpet’s highest stop, used for “Dinner on the Edge” and events.',
        tags: ['Dinner on the Edge', 'Starboard'],
      }),
      venue(16, {
        id: 'v16-mast-grill',
        positionConfidence: 'verified',
        name: 'Mast Grill',
        category: 'Casual Dining',
        color: C.dining,
        x: [200, 235],
        y: PORT,
        description: 'Poolside grill overlooking the pool deck.',
        tags: ['Grill', 'Poolside'],
      }),
      venue(16, {
        id: 'v16-mast-bar',
        positionConfidence: 'verified',
        name: 'Mast Bar',
        category: 'Bars & Lounges',
        color: C.bar,
        x: [200, 235],
        y: STBD,
        description: 'Top-deck bar beside the jogging track.',
        tags: ['Bar', 'Jogging Track'],
      })
    );
  }

  decks.push(
    deck(16, {
      title: isStretched ? 'Luminae & Retreat Sundeck' : 'The Retreat Sundeck & Pool',
      category: 'The Retreat',
      description: isStretched
        ? 'Edge Villa upper levels, the Retreat lower sundeck, Luminae at The Retreat, and hot tubs.'
        : 'Edge Villa upper levels, The Retreat Sundeck and dedicated Retreat Pool.',
      venues: deck16Venues,
    })
  );

  // ---------------------------------------------------------------- Deck 17
  if (hasDeck17) {
    decks.push(
      deck(17, {
        title: 'The Retreat Sundeck',
        category: 'The Retreat',
        description: 'The suites-only Retreat Sundeck with round pool, plunge pools, cabanas and The Retreat Bar.',
        venues: [
          ...generateCenterlineCore(17, ['fwd']),
          venue(17, {
            id: 'v17-retreat-sundeck',
            positionConfidence: 'verified',
            name: 'The Retreat Sundeck',
            category: 'Pool & Sun Deck',
            color: C.pool,
            x: [96, 150],
            description: 'Round pool, plunge pools and cabanas for suite guests.',
            tags: ['The Retreat', 'Suite Guests Only', 'Pool'],
            access: 'suite',
            aliases: ['Retreat Sundeck'],
          }),
          venue(17, {
            id: 'v17-retreat-bar',
            positionConfidence: 'estimated',
            name: 'The Retreat Bar',
            category: 'Bars & Lounges',
            color: C.bar,
            x: [152, 176],
            description: 'Poolside bar for Retreat guests.',
            tags: ['The Retreat', 'Suite Guests Only'],
            access: 'suite',
            aliases: ['Retreat Bar'],
          }),
        ],
      })
    );
  }

  return decks;
}
