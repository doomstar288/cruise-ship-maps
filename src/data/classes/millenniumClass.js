/**
 * Parametric deck generator for Millennium-Class cruise ships.
 *
 * Supports all 4 sister ships:
 * - Celebrity Millennium (2000)
 * - Celebrity Infinity (2001)
 * - Celebrity Summit (2001)
 * - Celebrity Constellation (2002)
 *
 * Vessel specs: ~294m length, ~32.2m beam, ~91,000 GT.
 * 11 guest decks (Decks 2–12; Deck 13 skipped per maritime tradition).
 */

import {
  createHullPipeline,
  VENUE_COLORS as C,
} from '../../utils/deckPlanDataPipeline.js';

// Millennium Class specific core stations
const MILLENNIUM_CORE_STATIONS = {
  fwd: { x: [76, 88], label: 'Forward' },
  mid: { x: [160, 172], label: 'Midship' },
  aft: { x: [236, 248], label: 'Aft' },
};

// Transverse zoning bands for 32.2m beam (centerline = 16.1m)
const PORT_OUTER = [1, 11];
const STBD_OUTER = [21.2, 31.2];
const CENTER_PASSAGE = [11, 21.2];
const FULL_BEAM_INNER = [3, 29.2];

/** Multi-deck venue groups and their deck spans. */
function getVenueGroups() {
  return {
    theatre: { spansDecks: [3, 4, 5], aliases: ['Celebrity Theater', 'The Theater', 'Theater'] },
    'grand-foyer': { spansDecks: [3, 4, 5], aliases: ['Grand Foyer', 'Atrium'] },
    'main-restaurant': { spansDecks: [4, 5], aliases: ['Main Restaurant', 'Main Dining Room'] },
  };
}

/** Standard mid/aft veranda cabin */
const millenniumVeranda = (x) => (x >= 90 && x < 190 ? 'E1' : 'E3');

/**
 * Generates all decks for a Millennium-Class ship given its manifest.
 *
 * @param {object} manifest Ship manifest (loaded from src/data/ships/<shipId>/manifest.json)
 * @returns {Array<object>} Array of deck objects
 */
export function generateMillenniumClassDecks(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('generateMillenniumClassDecks requires a valid manifest');
  }

  const lengthMeters = manifest.lengthMeters ?? 294;
  const beamMeters = manifest.beamMeters ?? 32.2;
  const pipeline = createHullPipeline({
    lengthMeters,
    beamMeters,
    coreStations: MILLENNIUM_CORE_STATIONS,
  });

  const {
    placeVenue,
    generateHullOutline,
    generateCenterlineCore,
    generateServiceStrips,
    generateStaterooms,
    sternStairX,
  } = pipeline;

  const STERN_STAIR_X = sternStairX;
  const CORES = [
    MILLENNIUM_CORE_STATIONS.fwd.x,
    MILLENNIUM_CORE_STATIONS.mid.x,
    MILLENNIUM_CORE_STATIONS.aft.x,
  ];

  // Main dining room name from manifest
  const mainDiningVenue = (manifest.venues || []).find((v) => v.category === 'Fine Dining' && v.name.includes('Restaurant'));
  const mainDiningName = mainDiningVenue ? mainDiningVenue.name.replace(/\s*\(Lower Level\)$/, '') : 'Metropolitan Restaurant';

  // Forward observation lounge name
  const deck11LoungeVenue = (manifest.venues || []).find((v) => v.deck === 11 && v.category === 'Bars & Lounges' && v.zone === 'fwd');
  const deck11LoungeName = deck11LoungeVenue ? deck11LoungeVenue.name : 'Cosmos Lounge';

  const venueGroups = getVenueGroups();
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
      typeFor,
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
      title: 'Medical Center & Services',
      category: 'Tenders & Guest Services',
      description: 'Shipboard Medical Center, embarkation gangway and security checkpoint, crew quarters and engineering technical areas.',
      venues: [
        venue(2, {
          id: 'v2-medical',
          name: 'Medical Center',
          category: 'Guest Services',
          color: C.service,
          x: [50, 74],
          description: 'Shipboard medical clinic staffed by certified physicians and nursing staff.',
          tags: ['Medical', 'First Aid'],
          aliases: ['Medical Clinic'],
        }),
        ...generateCenterlineCore(2),
        venue(2, {
          id: 'v2-gangway',
          name: 'Gangway & Security',
          category: 'Guest Services',
          color: C.service,
          x: [110, 144],
          y: PORT_OUTER,
          description: 'Port side embarkation gangway and security screening checkpoint.',
          tags: ['Gangway', 'Security'],
          aliases: ['Gangway', 'Security Screening'],
        }),
        venue(2, {
          id: 'v2-crew-tech',
          name: 'Crew & Technical Areas',
          category: 'Crew & Service',
          color: C.backOfHouse,
          x: [174, 234],
          description: 'Ship propulsion systems and engineering technical spaces. Crew only.',
          tags: ['Crew Only'],
          hideLabel: true,
        }),
        venue(2, {
          id: 'v2-provision-stores',
          name: 'Provision Stores',
          category: 'Crew & Service',
          color: C.backOfHouse,
          x: [250, 284],
          description: 'Provisions, refrigerated dry stores, and laundry facilities. Crew only.',
          tags: ['Crew Only'],
          hideLabel: true,
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 3
  decks.push(
    deck(3, {
      title: 'Celebrity Theater & Staterooms',
      category: 'Entertainment & Staterooms',
      description: 'Celebrity Theater lower level, Grand Foyer atrium, Guest Relations, Shore Excursions, and oceanview staterooms.',
      venues: [
        venue(3, {
          id: 'v3-theatre',
          ...partOf('theatre'),
          name: 'Celebrity Theater (Lower Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [20, 72],
          y: FULL_BEAM_INNER,
          description: 'Three-story main show theater featuring Broadway and West End production spectacles. Lower level.',
          tags: ['Shows', 'Lower Level'],
          aliases: ['Celebrity Theater', 'The Theater'],
        }),
        ...generateCenterlineCore(3),
        venue(3, {
          id: 'v3-grand-foyer',
          ...partOf('grand-foyer'),
          name: 'Grand Foyer (Lower Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [92, 120],
          y: [8, 24],
          description: 'Elegant multi-deck central atrium featuring a backlit translucent onyx staircase and classical musical ensembles.',
          tags: ['Atrium', 'Live Music'],
          aliases: ['Grand Foyer', 'Atrium'],
        }),
        venue(3, {
          id: 'v3-guest-relations',
          name: 'Guest Relations',
          category: 'Guest Services',
          color: C.service,
          x: [124, 144],
          y: PORT_OUTER,
          description: '24-hour reception desk for guest inquiries, billing, and onboard assistance.',
          tags: ['Reception', 'Customer Service'],
          aliases: ['Guest Relations', 'Guest Services', 'Reception'],
        }),
        venue(3, {
          id: 'v3-shore-excursions',
          name: 'Shore Excursions Desk',
          category: 'Guest Services',
          color: C.service,
          x: [124, 144],
          y: STBD_OUTER,
          description: 'Destination concierge desk for booking guided shore excursions and cultural tours.',
          tags: ['Tours', 'Excursions'],
          aliases: ['Shore Ex', 'Shore Excursions'],
        }),
        ...generateServiceStrips(3, { range: [174, 234] }),
        ...generateStaterooms(3, {
          range: [174, 234],
          typeFor: ({ row }) => (row === 'outside' ? 'O2' : 'I2'),
          cabinRanges: manifest.cabinRanges?.['3'],
        }),
        venue(3, {
          id: 'v3-crew-aft',
          name: 'Crew Support Spaces',
          category: 'Crew & Service',
          color: C.backOfHouse,
          x: [250, 286],
          description: 'Back-of-house operational spaces. Crew only.',
          tags: ['Crew Only'],
          hideLabel: true,
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 4
  decks.push(
    deck(4, {
      title: 'Casino, Rendezvous & Dining',
      category: 'Entertainment & Dining',
      description: 'Celebrity Theater orchestra level, Fortunes Casino, Martini Bar, Rendezvous Lounge, Photo Gallery, and lower level of the Main Restaurant.',
      venues: [
        venue(4, {
          id: 'v4-theatre',
          ...partOf('theatre'),
          name: 'Celebrity Theater (Orchestra)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [20, 72],
          y: FULL_BEAM_INNER,
          description: 'Middle orchestra tier of the three-deck production theater.',
          tags: ['Shows', 'Theater'],
          aliases: ['Celebrity Theater', 'The Theater'],
        }),
        ...generateCenterlineCore(4),
        venue(4, {
          id: 'v4-cinema',
          name: 'Cinema & Conference Center',
          category: 'Entertainment',
          color: C.entertainment,
          x: [90, 108],
          y: PORT_OUTER,
          description: 'Dedicated movie cinema screening first-run films and hosting lectures.',
          tags: ['Movies', 'Cinema'],
          aliases: ['Cinema'],
        }),
        venue(4, {
          id: 'v4-casino',
          name: 'Fortunes Casino',
          category: 'Entertainment',
          color: C.entertainment,
          x: [110, 136],
          y: FULL_BEAM_INNER,
          description: 'Exciting Vegas-style gaming venue featuring craps, blackjack, roulette, poker, and slots.',
          tags: ['Casino', 'Gaming'],
          aliases: ['Fortunes Casino', 'The Casino', 'Casino'],
        }),
        venue(4, {
          id: 'v4-casino-bar',
          name: 'Casino Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [90, 108],
          y: STBD_OUTER,
          description: 'Cocktails and spirits right beside the casino gaming tables.',
          tags: ['Bar', 'Casino'],
        }),
        venue(4, {
          id: 'v4-grand-foyer',
          ...partOf('grand-foyer'),
          name: 'Grand Foyer (Middle Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [138, 158],
          y: [8, 24],
          description: 'Central atrium level overlooking the lower foyer and grand staircase.',
          tags: ['Atrium'],
          aliases: ['Grand Foyer'],
        }),
        venue(4, {
          id: 'v4-martini-bar',
          name: 'Martini Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [138, 158],
          y: PORT_OUTER,
          description: 'Celebrity signature frosted bar counter offering handcrafted martinis and theatrical shaker pours.',
          tags: ['Martinis', 'Cocktails'],
          aliases: ['Martini Bar', 'The Martini Bar'],
        }),
        venue(4, {
          id: 'v4-rendezvous-lounge',
          name: 'Rendezvous Lounge',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [138, 158],
          y: STBD_OUTER,
          description: 'Warm, inviting pre-dinner cocktail lounge with live dance music and cabaret acts.',
          tags: ['Live Music', 'Dancing'],
          aliases: ['Rendezvous Lounge', 'Rendezvous'],
        }),
        venue(4, {
          id: 'v4-photo-gallery',
          name: 'Photo Gallery & Studio',
          category: 'Guest Services',
          color: C.service,
          x: [174, 218],
          y: CENTER_PASSAGE,
          description: 'Interactive digital photo viewing kiosks and fine portrait photography studio.',
          tags: ['Photos'],
          aliases: ['Photo Gallery'],
        }),
        venue(4, {
          id: 'v4-main-restaurant',
          ...partOf('main-restaurant'),
          name: `${mainDiningName} (Lower Level)`,
          category: 'Fine Dining',
          color: C.dining,
          x: [250, 288],
          y: FULL_BEAM_INNER,
          description: `Two-story grand main dining venue featuring soaring ocean-view stern windows and multi-course culinary creations. Lower level.`,
          tags: ['Main Dining', 'Dinner'],
          aliases: [mainDiningName, 'Main Restaurant', 'Main Dining Room'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 5
  decks.push(
    deck(5, {
      title: 'Specialty Dining & Galleria Boutiques',
      category: 'Dining & Shopping',
      description: 'Celebrity Theater balcony, Galleria Boutiques, Art Gallery, Café al Bacio, Blu, Tuscan Grille, and upper level of the Main Restaurant.',
      venues: [
        venue(5, {
          id: 'v5-theatre',
          ...partOf('theatre'),
          name: 'Celebrity Theater (Balcony)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [20, 72],
          y: FULL_BEAM_INNER,
          description: 'Balcony tier of the three-deck production theater.',
          tags: ['Shows', 'Balcony'],
          aliases: ['Celebrity Theater', 'The Theater'],
        }),
        ...generateCenterlineCore(5),
        venue(5, {
          id: 'v5-galleria-boutiques',
          name: 'Galleria Boutiques',
          category: 'Shopping',
          color: C.shopping,
          x: [92, 138],
          y: PORT_OUTER,
          description: 'Tax- and duty-free shopping for designer fashion, fine watches, perfumes, and liquor.',
          tags: ['Shopping', 'Boutiques'],
          aliases: ['Galleria Boutiques', 'The Shops'],
        }),
        venue(5, {
          id: 'v5-art-gallery',
          name: 'Art Gallery',
          category: 'Entertainment',
          color: C.entertainment,
          x: [92, 138],
          y: STBD_OUTER,
          description: 'Fine art gallery with original paintings, sculptures, and live art auctions.',
          tags: ['Art', 'Auctions'],
          aliases: ['Art Gallery', 'Park West Gallery'],
        }),
        venue(5, {
          id: 'v5-grand-foyer',
          ...partOf('grand-foyer'),
          name: 'Grand Foyer (Upper Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [140, 158],
          y: [8, 24],
          description: 'Top floor of the Grand Foyer atrium with views down to the onyx staircase.',
          tags: ['Atrium'],
          aliases: ['Grand Foyer'],
        }),
        venue(5, {
          id: 'v5-cafe-bacio',
          name: 'Café al Bacio & Gelateria',
          category: 'Dining',
          color: C.dining,
          x: [142, 160],
          y: PORT_OUTER,
          description: 'European-style café serving custom espresso, artisanal teas, freshly baked pastries, and Italian gelato.',
          tags: ['Coffee', 'Pastries', 'Gelato'],
          aliases: ['Cafe al Bacio', 'Café al Bacio', 'Gelateria'],
        }),
        venue(5, {
          id: 'v5-cellar-masters',
          name: 'Cellar Masters',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [142, 160],
          y: STBD_OUTER,
          description: 'Intimate wine lounge featuring sommelier-curated tastings and global vintages.',
          tags: ['Wine', 'Lounge'],
          aliases: ['Cellar Masters', 'Wine Bar'],
        }),
        venue(5, {
          id: 'v5-blu',
          name: 'Blu',
          category: 'Fine Dining',
          color: C.dining,
          x: [176, 232],
          y: PORT_OUTER,
          description: 'AquaClass specialty restaurant serving inventive, clean cuisine prepared with natural, fresh ingredients.',
          tags: ['AquaClass', 'Specialty Dining'],
          aliases: ['Blu Restaurant', 'Blu'],
        }),
        venue(5, {
          id: 'v5-tuscan-grille',
          name: 'Tuscan Grille',
          category: 'Fine Dining',
          color: C.dining,
          x: [176, 232],
          y: STBD_OUTER,
          description: 'Italian steakhouse featuring handmade pasta, artisanal charcuterie, USDA Prime dry-aged steaks, and Italian wines.',
          tags: ['Italian', 'Steakhouse'],
          aliases: ['Tuscan Grille', 'Tuscan Grill'],
        }),
        venue(5, {
          id: 'v5-main-restaurant',
          ...partOf('main-restaurant'),
          name: `${mainDiningName} (Upper Level)`,
          category: 'Fine Dining',
          color: C.dining,
          x: [250, 288],
          y: FULL_BEAM_INNER,
          description: `Upper level of ${mainDiningName} providing panoramic views over the stern wake.`,
          tags: ['Main Dining', 'Dinner'],
          aliases: [mainDiningName, 'Main Restaurant Upper'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Decks 6–9 (Staterooms & Suites)
  for (let lvl = 6; lvl <= 9; lvl += 1) {
    const isSuiteDeck = lvl === 6;
    const title = isSuiteDeck ? 'Penthouse Suites & Staterooms' : lvl === 9 ? 'AquaClass & Staterooms' : 'Staterooms & Suites';

    decks.push(
      deck(lvl, {
        title,
        category: 'Staterooms',
        description: `Guest staterooms and suites on Deck ${lvl}, with forward, midship, and aft elevator access.${isSuiteDeck ? ' Features Penthouse and Royal Suites midship.' : ''}`,
        venues: [
          ...stateroomDeck(lvl, {
            range: [16, 264],
            typeFor: ({ x, row, side }) => {
              if (row === 'inside') return 'I2';
              if (lvl === 6 && x >= 142 && x <= 158) {
                return side === 'Port' ? 'PS' : 'RS'; // Penthouse and Royal Suites
              }
              if (lvl === 6 && x >= 132 && x <= 140) return 'CS'; // Celebrity Suites
              if (lvl === 9) return 'A1'; // AquaClass on Deck 9
              if (lvl === 8) return 'C2'; // Concierge Class on Deck 8
              return millenniumVeranda(x);
            },
            transom: true,
          }),
        ],
      })
    );
  }

  // ---------------------------------------------------------------- Deck 10 (Pool Deck, Solarium & Buffet)
  decks.push(
    deck(10, {
      title: 'Resort Pool, Solarium & Buffet',
      category: 'Pools & Sun Deck',
      description: 'The Spa and signature Thalassotherapy Pool in the glass-domed Solarium, Main Resort Pool, and Oceanview Café & Grill.',
      venues: [
        venue(10, {
          id: 'v10-spa',
          name: 'The Spa & Fitness Center',
          category: 'Spa & Wellness',
          color: C.spa,
          x: [28, 74],
          y: FULL_BEAM_INNER,
          description: 'Full-service wellness sanctuary offering massages, facials, acupuncture, and a state-of-the-art ocean-view fitness gym.',
          tags: ['Spa', 'Wellness', 'Gym'],
          aliases: ['The Spa', 'Canyon Ranch', 'Fitness Center', 'Gym'],
        }),
        venue(10, {
          id: 'v10-persian-garden',
          name: 'Persian Garden',
          category: 'Spa & Wellness',
          color: C.spa,
          x: [58, 74],
          y: PORT_OUTER,
          description: 'Thermal suite with steam rooms, dry saunas, and heated ceramic relaxation loungers.',
          tags: ['Thermal Suite', 'Sauna'],
        }),
        ...generateCenterlineCore(10),
        venue(10, {
          id: 'v10-solarium',
          name: 'Solarium & Thalassotherapy Pool',
          category: 'Pools & Sun Deck',
          color: C.pool,
          x: [90, 154],
          y: FULL_BEAM_INNER,
          description: 'Signature glass-canopied adult retreat featuring Millennium Class iconic Thalassotherapy seawater pool with hydro-massage jets.',
          tags: ['Solarium', 'Adults Only', 'Thalassotherapy'],
          aliases: ['Thalassotherapy Pool', 'Solarium', 'Adults Pool'],
        }),
        venue(10, {
          id: 'v10-aquaspa-cafe',
          name: 'AquaSpa Café',
          category: 'Casual Dining',
          color: C.dining,
          x: [94, 114],
          y: PORT_OUTER,
          description: 'Fresh smoothies, juices, cereal bowls, and light organic lunch fare.',
          tags: ['Healthy', 'Spa Cafe'],
          aliases: ['AquaSpa Cafe', 'Spa Cafe'],
        }),
        venue(10, {
          id: 'v10-main-pool',
          name: 'Main Resort Pool',
          category: 'Pools & Sun Deck',
          color: C.pool,
          x: [176, 206],
          y: [10, 22.2],
          description: 'Outdoor freshwater swimming pool with whirlpool spas, plush loungers, and live poolside music.',
          tags: ['Pool', 'Sun Deck'],
          aliases: ['Main Pool', 'Resort Pool'],
        }),
        venue(10, {
          id: 'v10-pool-bar',
          name: 'Pool Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [176, 204],
          y: PORT_OUTER,
          description: 'Poolside bar serving cold draft beers, frozen piña coladas, and refreshing cocktails.',
          tags: ['Pool Bar', 'Cocktails'],
          aliases: ['Pool Bar'],
        }),
        venue(10, {
          id: 'v10-mast-grill',
          name: 'Mast Bar & Grill',
          category: 'Casual Dining',
          color: C.dining,
          x: [176, 204],
          y: STBD_OUTER,
          description: 'Classic poolside grill serving made-to-order hamburgers, hot dogs, chicken sandwiches, and crispy fries.',
          tags: ['Grill', 'Burgers'],
          aliases: ['Mast Grill', 'Mast Bar'],
        }),
        venue(10, {
          id: 'v10-oceanview-cafe',
          name: 'Oceanview Café & Grill',
          category: 'Dining',
          color: C.dining,
          x: [210, 234],
          y: FULL_BEAM_INNER,
          description: 'Bustling buffet market featuring global culinary stations: pasta bar, Asian noodle station, salad bar, rotisserie meats, and dessert bakery.',
          tags: ['Buffet', 'Casual Dining'],
          aliases: ['Oceanview Café', 'Oceanview Cafe', 'Buffet', 'OVC'],
        }),
        venue(10, {
          id: 'v10-oceanview-bar',
          name: 'Oceanview Bar & Terrace',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [250, 288],
          y: [5, 27.2],
          description: 'Shaded open-air aft terrace bar with scenic wake views.',
          tags: ['Outdoor Bar', 'Aft Terrace'],
          aliases: ['Oceanview Bar', 'Aft Terrace'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 11 (Sky Lounge, Kids & Sunset Bar)
  decks.push(
    deck(11, {
      title: 'Sky Lounge, Camp at Sea & Sunset Bar',
      category: 'Lounges & Kids',
      description: `${deck11LoungeName} forward observation lounge, Jogging Track, Camp at Sea youth center, and Sunset Bar with Rooftop Terrace aft.`,
      venues: [
        venue(11, {
          id: 'v11-sky-lounge',
          name: deck11LoungeName,
          category: 'Bars & Lounges',
          color: C.bar,
          x: [32, 72],
          y: FULL_BEAM_INNER,
          description: 'Panoramic forward observation lounge offering floor-to-ceiling vistas, afternoon cocktails, live music, and evening dancing.',
          tags: ['Observation', 'Cocktails', 'Panoramic'],
          aliases: [deck11LoungeName, 'Observation Lounge', 'Sky Lounge'],
        }),
        ...generateCenterlineCore(11, ['fwd']),
        venue(11, {
          id: 'v11-jogging-track',
          name: 'Jogging Track',
          category: 'Sports',
          color: C.entertainment,
          x: [90, 184],
          y: [4, 28.2],
          description: 'Top-deck running and walking track encircling the central pool area.',
          tags: ['Jogging', 'Fitness'],
          aliases: ['Jogging Track', 'Running Track'],
        }),
        venue(11, {
          id: 'v11-camp-at-sea',
          name: 'Camp at Sea',
          category: 'Kids & Teens',
          color: C.entertainment,
          x: [186, 218],
          y: PORT_OUTER,
          description: 'Dedicated youth center featuring interactive gaming, arts and crafts, STEM activities, and scavenger hunts.',
          tags: ['Kids Club'],
          aliases: ['Camp at Sea', 'Kids Club', 'Fun Factory'],
        }),
        venue(11, {
          id: 'v11-xclub',
          name: 'XClub Teen Lounge',
          category: 'Kids & Teens',
          color: C.entertainment,
          x: [186, 218],
          y: STBD_OUTER,
          description: 'Exclusive hangout for teens aged 13–17 with video consoles, foosball, music, and late-night teen parties.',
          tags: ['Teens'],
          aliases: ['XClub', 'Teen Club'],
        }),
        venue(11, {
          id: 'v11-rooftop-terrace',
          name: 'Rooftop Terrace',
          category: 'Entertainment',
          color: C.entertainment,
          x: [224, 260],
          y: CENTER_PASSAGE,
          description: 'Outdoor movie cinema and chic lounge space under the stars with plush daybeds and cocktail service.',
          tags: ['Movies', 'Outdoor Lounge'],
          aliases: ['Rooftop Terrace', 'Aft Terrace'],
        }),
        venue(11, {
          id: 'v11-sunset-bar',
          name: 'Sunset Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [262, 284],
          y: [4, 28.2],
          description: 'Signature aft outdoor bar offering the ultimate sunset and wake views with craft cocktails and beers.',
          tags: ['Sunset Bar', 'Aft View', 'Cocktails'],
          aliases: ['Sunset Bar', 'Aft Sunset Bar'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 12 (Retreat Sundeck & Sports)
  decks.push(
    deck(12, {
      title: 'The Retreat Sundeck & Sports Court',
      category: 'Suites & Sports',
      description: 'The Retreat Sundeck forward for suite guests, and the open-air Sports Court aft.',
      venues: [
        venue(12, {
          id: 'v12-retreat-sundeck',
          name: 'The Retreat Sundeck',
          category: 'Pools & Sun Deck',
          color: C.suite,
          x: [36, 78],
          y: [6, 26.2],
          description: 'Exclusive private sundeck reserved for suite guests, featuring luxury loungers, dedicated concierge, and poolside cocktails.',
          tags: ['Suites', 'Retreat', 'Sundeck'],
          aliases: ['The Retreat Sundeck', 'Retreat Sundeck'],
        }),
        ...generateCenterlineCore(12, ['fwd']),
        venue(12, {
          id: 'v12-sports-court',
          name: 'Sports Court',
          category: 'Sports',
          color: C.entertainment,
          x: [220, 260],
          y: [7, 25.2],
          description: 'Outdoor basketball and pickleball court with panoramic ocean breezes.',
          tags: ['Basketball', 'Pickleball', 'Sports'],
          aliases: ['Sports Court', 'Sport Court'],
        }),
      ],
    })
  );

  return decks;
}
