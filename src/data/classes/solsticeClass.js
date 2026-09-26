/**
 * Parametric deck generator for Solstice-Class cruise ships.
 *
 * Supports all 5 sister ships:
 * - Celebrity Solstice (2008)
 * - Celebrity Equinox (2009)
 * - Celebrity Eclipse (2010)
 * - Celebrity Silhouette (2011)
 * - Celebrity Reflection (2012)
 *
 * Vessel specs: ~317m length, ~37m beam, ~122,000 GT.
 * 13 guest decks (Decks 2–12, 14–16; Deck 13 skipped per maritime tradition).
 */

import {
  createHullPipeline,
  CORE_STATIONS,
  VENUE_COLORS as C,
} from '../../utils/deckPlanDataPipeline.js';

// Transverse zoning bands (y, metres from port hull)
const PORT_OUTER = [1, 12];
const STBD_OUTER = [25, 36];
const CENTER_PASSAGE = [12, 25];
const FULL_BEAM_INNER = [4, 33];

/** Multi-deck venue groups and their deck spans. */
function getVenueGroups() {
  return {
    theatre: { spansDecks: [3, 4, 5], aliases: ['Solstice Theatre', 'The Theatre', 'Theatre'] },
    'grand-foyer': { spansDecks: [3, 4, 5], aliases: ['Grand Foyer', 'Atrium'] },
    'main-restaurant': { spansDecks: [3, 4], aliases: ['Main Restaurant', 'Main Dining Room'] },
  };
}

/** Standard mid/aft veranda cabin */
const solsticeVeranda = (x) => (x >= 100 && x < 200 ? 'E1' : 'E3');

/**
 * Generates all decks for a Solstice-Class ship given its manifest.
 *
 * @param {object} manifest Ship manifest (loaded from src/data/ships/<shipId>/manifest.json)
 * @returns {Array<object>} Array of deck objects
 */
export function generateSolsticeClassDecks(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('generateSolsticeClassDecks requires a valid manifest');
  }

  const lengthMeters = manifest.lengthMeters ?? 317.2;
  const beamMeters = manifest.beamMeters ?? 36.9;
  const pipeline = createHullPipeline({ lengthMeters, beamMeters });

  const {
    placeVenue,
    generateHullOutline,
    generateCenterlineCore,
    generateServiceStrips,
    generateStaterooms,
    sternStairX,
  } = pipeline;

  const STERN_STAIR_X = sternStairX;
  const CORES = [CORE_STATIONS.fwd.x, CORE_STATIONS.mid.x, CORE_STATIONS.aft.x];

  const venueNames = new Set((manifest.venues || []).map((v) => v.name));
  const hasVenue = (name) => venueNames.has(name);
  const hasCraftSocial = hasVenue('Craft Social');
  const hasLawnClubGrill = hasVenue('Lawn Club Grill');
  const hasSilkHarvest = hasVenue('Silk Harvest');
  const hasDeck3Luminae = (manifest.venues || []).some((v) => v.deck === 3 && v.name.includes('Luminae'));

  // Main dining room name from manifest
  const mainDiningVenue = (manifest.venues || []).find((v) => v.deck === 3 && v.category === 'Fine Dining' && v.name.includes('Restaurant'));
  const mainDiningName = mainDiningVenue ? mainDiningVenue.name.replace(/\s*\(Lower Level\)$/, '') : 'Grand Epernay Restaurant';

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
      title: 'Medical Center & Technical',
      category: 'Tenders & Guest Services',
      description: 'Shipboard Medical Center forward, security screening and tender gangway midship, crew and technical facilities.',
      venues: [
        venue(2, {
          id: 'v2-medical',
          name: 'Medical Center',
          category: 'Guest Services',
          color: C.service,
          x: [54, 78],
          description: 'Shipboard medical clinic staffed by physicians and nurses.',
          tags: ['Medical', 'First Aid'],
          aliases: ['Medical Clinic'],
        }),
        ...generateCenterlineCore(2),
        venue(2, {
          id: 'v2-gangway',
          positionConfidence: 'estimated', // not in any published source
          name: 'Gangway & Security',
          category: 'Guest Services',
          color: C.service,
          x: [136, 178],
          y: PORT_OUTER,
          description: 'Port side embarkation gangway and security checkpoint.',
          tags: ['Gangway', 'Security'],
          portExit: 'gangway',
          aliases: ['Gangway', 'Security Screening', 'Disembarkation'],
        }),
        venue(2, {
          id: 'v2-tender-station',
          positionConfidence: 'estimated', // not in any published source
          name: 'Tender Boarding Station',
          category: 'Guest Services',
          color: C.service,
          x: [136, 178],
          y: STBD_OUTER,
          description: 'Starboard tender boarding station for port tender operations.',
          tags: ['Tender'],
          portExit: 'tender',
          aliases: ['Tender Platform'],
        }),
        venue(2, {
          id: 'v2-crew-tech',
          name: 'Crew Technical Areas',
          category: 'Crew & Service',
          color: C.backOfHouse,
          x: [200, 258],
          description: 'Ship propulsion systems and engineering spaces. Crew only.',
          tags: ['Crew Only'],
          hideLabel: true,
        }),
        venue(2, {
          id: 'v2-provision-stores',
          name: 'Provision Stores',
          category: 'Crew & Service',
          color: C.backOfHouse,
          x: [276, 308],
          description: 'Provisions, dry stores, and cold rooms. Crew only.',
          tags: ['Crew Only'],
          hideLabel: true,
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 3
  decks.push(
    deck(3, {
      title: 'Grand Foyer & Passport Bar',
      category: 'Public Venues & Staterooms',
      description: 'Solstice Theatre lower level forward, Grand Foyer with Passport Bar (or Luminae on Reflection), Guest Relations desk, oceanview staterooms, and the lower level of the Main Restaurant.',
      venues: [
        venue(3, {
          id: 'v3-theatre',
          ...partOf('theatre'),
          name: 'Solstice Theatre (Lower Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [24, 78],
          y: FULL_BEAM_INNER,
          description: 'Three-deck main show lounge hosting Broadway-style productions and guest artists. Lower level entrance.',
          tags: ['Shows', 'Lower Level'],
          aliases: ['Solstice Theatre', 'The Theatre'],
        }),
        ...generateCenterlineCore(3),
        venue(3, {
          id: 'v3-grand-foyer',
          ...partOf('grand-foyer'),
          name: 'Grand Foyer (Lower Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [146, 176],
          y: [10, 27],
          description: 'The soaring multi-deck central atrium featuring live classical music and sweeping staircases.',
          tags: ['Atrium', 'Live Music'],
          aliases: ['Grand Foyer', 'Atrium'],
        }),
        venue(3, {
          id: hasDeck3Luminae ? 'v3-luminae' : 'v3-passport-bar',
          name: hasDeck3Luminae ? 'Luminae' : 'Passport Bar',
          category: hasDeck3Luminae ? 'Fine Dining' : 'Bars & Lounges',
          color: hasDeck3Luminae ? C.dining : C.bar,
          x: [150, 172],
          y: PORT_OUTER,
          description: hasDeck3Luminae
            ? 'Exclusive restaurant reserved for guests of The Retreat, featuring modern eclectic menus.'
            : 'Welcoming lobby lounge right off the Grand Foyer offering craft cocktails, wines, and beers.',
          tags: hasDeck3Luminae ? ['Suites', 'Fine Dining'] : ['Cocktails', 'Lobby'],
          access: hasDeck3Luminae ? 'suite' : undefined,
          aliases: hasDeck3Luminae ? ['Luminae Restaurant'] : ['Passport Bar', 'Passport'],
        }),
        venue(3, {
          id: 'v3-guest-relations',
          name: 'Guest Relations',
          category: 'Guest Services',
          color: C.service,
          x: [136, 146],
          y: PORT_OUTER,
          description: '24-hour reception desk for guest inquiries, currency exchange, and assistance.',
          tags: ['Reception', 'Customer Service'],
          aliases: ['Guest Relations', 'Guest Services', 'Reception'],
        }),
        venue(3, {
          id: 'v3-shore-excursions',
          name: 'Shore Excursions',
          category: 'Guest Services',
          color: C.service,
          x: [136, 146],
          y: STBD_OUTER,
          description: 'Tour desk offering curated destination experiences and guided excursions.',
          tags: ['Tours', 'Excursions'],
          aliases: ['Shore Ex', 'Shore Excursions'],
        }),
        venue(3, {
          id: 'v3-camp-at-sea',
          name: 'Camp at Sea',
          category: 'Kids & Teens',
          color: C.entertainment,
          x: [150, 172],
          y: STBD_OUTER,
          description: 'Youth activity club with age-tailored entertainment, science, technology, and arts.',
          tags: ['Kids', 'Activities'],
          access: 'kids',
          aliases: ['Kids Club'],
        }),
        ...generateServiceStrips(3, { range: [96, 134] }),
        ...generateStaterooms(3, {
          range: [96, 134],
          typeFor: ({ row }) => (row === 'outside' ? 'O2' : 'I2'),
          cabinRanges: manifest.cabinRanges?.['3'],
        }),
        venue(3, {
          id: 'v3-main-restaurant',
          ...partOf('main-restaurant'),
          name: `${mainDiningName} (Lower Level)`,
          category: 'Fine Dining',
          color: C.dining,
          x: [276, 314],
          y: FULL_BEAM_INNER,
          description: `Two-story grand dining room with an iconic two-story glass wine tower and crystal chandeliers. Lower level.`,
          tags: ['Main Dining', 'Dinner'],
          aliases: [mainDiningName, 'Main Restaurant', 'Main Dining Room'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 4
  decks.push(
    deck(4, {
      title: 'Entertainment, Casino & Shops',
      category: 'Entertainment & Shopping',
      description: 'Solstice Theatre middle level, Boulevard Shops, Fortunes Casino, Martini Bar & Crush, Quasar nightclub, Cellar Masters / Craft Social, and upper level of the Main Restaurant.',
      venues: [
        venue(4, {
          id: 'v4-theatre',
          ...partOf('theatre'),
          name: 'Solstice Theatre (Middle Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [24, 78],
          y: FULL_BEAM_INNER,
          description: 'Main production theater middle seating tier with unobstructed sightlines.',
          tags: ['Shows', 'Theater'],
          aliases: ['Solstice Theatre', 'The Theatre'],
        }),
        ...generateCenterlineCore(4),
        venue(4, {
          id: 'v4-entertainment-court',
          name: 'Entertainment Court',
          category: 'Entertainment',
          color: C.entertainment,
          x: [96, 110],
          y: CENTER_PASSAGE,
          description: 'Central hub hosting live band performances, game shows, and interactive events.',
          tags: ['Music', 'Live Music'],
          aliases: ['Entertainment Plaza'],
        }),
        venue(4, {
          id: 'v4-boulevard-shops',
          name: 'Boulevard Shops',
          category: 'Shopping',
          color: C.shopping,
          x: [112, 144],
          y: PORT_OUTER,
          description: 'Designer fashion, fine watches, jewelry, and luxury tax-free retail boutiques.',
          tags: ['Shopping', 'Boutiques'],
          aliases: ['Boulevard Shops', 'The Shops'],
        }),
        venue(4, {
          id: 'v4-photo-gallery',
          name: 'Photo Gallery & Studio',
          category: 'Guest Services',
          color: C.service,
          x: [112, 144],
          y: STBD_OUTER,
          description: 'Digital photo kiosks and professional portrait studio.',
          tags: ['Photos'],
          aliases: ['Photo Gallery'],
        }),
        venue(4, {
          id: 'v4-grand-foyer',
          ...partOf('grand-foyer'),
          name: 'Grand Foyer (Middle Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [146, 176],
          y: [10, 27],
          description: 'Midship grand atrium promenade overlooking the lobby level below.',
          tags: ['Atrium'],
          aliases: ['Grand Foyer'],
        }),
        venue(4, {
          id: 'v4-martini-bar',
          name: 'Martini Bar & Crush',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [150, 174],
          y: PORT_OUTER,
          description: 'Signature ice-topped bar known for classic and creative martinis with high-energy flair bartenders.',
          tags: ['Cocktails', 'Martinis'],
          aliases: ['Martini Bar', 'Crush'],
        }),
        venue(4, {
          id: 'v4-quasar',
          name: 'Quasar Nightclub',
          category: 'Entertainment',
          color: C.entertainment,
          x: [150, 174],
          y: STBD_OUTER,
          description: 'Retro-futuristic nightclub with pulsing DJ sets, light shows, and dance floor.',
          tags: ['Nightclub', 'Dancing'],
          aliases: ['Quasar'],
        }),
        venue(4, {
          id: 'v4-casino',
          name: 'Fortunes Casino',
          category: 'Entertainment',
          color: C.entertainment,
          x: [200, 238],
          y: FULL_BEAM_INNER,
          description: 'Full-service gaming casino with blackjack, roulette, poker tables, and slot machines.',
          tags: ['Casino', 'Gaming'],
          aliases: ['Fortunes Casino', 'The Casino', 'Casino'],
        }),
        venue(4, {
          id: 'v4-casino-bar',
          name: 'Casino Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [240, 258],
          y: STBD_OUTER,
          description: 'Action-adjacent bar serving draft beers and cocktails to casino players.',
          tags: ['Bar', 'Casino'],
        }),
        venue(4, {
          id: hasCraftSocial ? 'v4-craft-social' : 'v4-cellar-masters',
          name: hasCraftSocial ? 'Craft Social' : 'Cellar Masters',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [240, 258],
          y: PORT_OUTER,
          description: hasCraftSocial
            ? 'Gastropub featuring dozens of craft beers on tap and by the bottle, paired with gourmet comfort food.'
            : 'Enomatic state-of-the-art wine dispenser bar offering fine vintages by the glass from around the world.',
          tags: ['Beer', 'Wine', 'Lounge'],
          aliases: hasCraftSocial ? ['Craft Social Bar', 'Craft Social'] : ['Cellar Masters Wine Bar', 'Cellar Masters'],
        }),
        venue(4, {
          id: 'v4-main-restaurant',
          ...partOf('main-restaurant'),
          name: `${mainDiningName} (Upper Level)`,
          category: 'Fine Dining',
          color: C.dining,
          x: [276, 316],
          y: FULL_BEAM_INNER,
          description: `Upper tier of the two-story ${mainDiningName}, providing magnificent panoramic stern views.`,
          tags: ['Main Dining', 'Dinner'],
          aliases: [mainDiningName, 'Main Restaurant Upper'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 5
  decks.push(
    deck(5, {
      title: 'Specialty Dining & Galleria',
      category: 'Fine Dining & Lounges',
      description: 'Solstice Theatre balcony, Galleria Boutiques, Art Gallery, Café al Bacio, Ensemble Lounge, and specialty restaurants (Murano, Blu, Silk Harvest/Qsine, Tuscan Grille).',
      venues: [
        venue(5, {
          id: 'v5-theatre',
          ...partOf('theatre'),
          name: 'Solstice Theatre (Upper Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [24, 78],
          y: FULL_BEAM_INNER,
          description: 'Upper balcony seating for Solstice Theatre production performances.',
          tags: ['Shows', 'Balcony'],
          aliases: ['Solstice Theatre', 'The Theatre'],
        }),
        ...generateCenterlineCore(5),
        venue(5, {
          id: 'v5-galleria-boutiques',
          name: 'Galleria Boutiques',
          category: 'Shopping',
          color: C.shopping,
          x: [98, 144],
          y: PORT_OUTER,
          description: 'Fine jewelry, perfume, cosmetics, and Celebrity logo merchandise.',
          tags: ['Shopping', 'Boutiques'],
          aliases: ['Galleria Boutiques', 'The Boutiques'],
        }),
        venue(5, {
          id: 'v5-art-gallery',
          name: 'Art Gallery',
          category: 'Entertainment',
          color: C.entertainment,
          x: [98, 144],
          y: STBD_OUTER,
          description: 'Exhibition gallery exhibiting works by renowned modern artists and hosting art auctions.',
          tags: ['Art', 'Auctions'],
          aliases: ['Art Gallery', 'Park West Gallery'],
        }),
        venue(5, {
          id: 'v5-grand-foyer',
          ...partOf('grand-foyer'),
          name: 'Grand Foyer (Upper Level)',
          category: 'Entertainment',
          color: C.entertainment,
          x: [146, 176],
          y: [10, 27],
          description: 'Top floor of the Grand Foyer overlooking the atrium chandelier.',
          tags: ['Atrium'],
          aliases: ['Grand Foyer'],
        }),
        venue(5, {
          id: 'v5-cafe-bacio',
          name: 'Café al Bacio & Gelateria',
          category: 'Dining',
          color: C.dining,
          x: [148, 174],
          y: PORT_OUTER,
          description: 'European-style patisserie serving specialty espresso, Lavazza coffee, herbal teas, pastries, and authentic Italian gelato.',
          tags: ['Coffee', 'Pastries', 'Gelato'],
          aliases: ['Cafe al Bacio', 'Café al Bacio', 'Gelateria'],
        }),
        venue(5, {
          id: 'v5-world-class-bar',
          name: 'World Class Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [148, 174],
          y: STBD_OUTER,
          description: 'Expert mixologists crafting bespoke cocktails with premium spirits and fresh botanicals.',
          tags: ['Cocktails', 'Mixology'],
        }),
        venue(5, {
          id: 'v5-ensemble-lounge',
          name: 'Ensemble Lounge',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [200, 218],
          y: CENTER_PASSAGE,
          description: 'Sophisticated gateway lounge to the specialty dining district, featuring live jazz and acoustic sets.',
          tags: ['Cocktails', 'Live Music', 'Jazz'],
          aliases: ['Ensemble Lounge', 'Ensemble'],
        }),
        venue(5, {
          id: 'v5-murano',
          name: 'Murano',
          category: 'Fine Dining',
          color: C.dining,
          x: [220, 244],
          y: PORT_OUTER,
          description: 'Contemporary French fine dining featuring table-side preparation, artisanal cheese cart, and extensive vintage wine list.',
          tags: ['French', 'Specialty Dining'],
          aliases: ['Murano Restaurant', 'Murano'],
        }),
        venue(5, {
          id: 'v5-blu',
          name: 'Blu',
          category: 'Fine Dining',
          color: C.dining,
          x: [220, 244],
          y: STBD_OUTER,
          description: 'Clean-cuisine specialty restaurant exclusively dedicated to AquaClass guests, highlighting fresh farm-to-table flavors.',
          tags: ['AquaClass', 'Healthy Dining'],
          aliases: ['Blu Restaurant', 'Blu'],
        }),
        venue(5, {
          id: 'v5-specialty-asian',
          name: hasSilkHarvest ? 'Silk Harvest' : 'Qsine / Le Petit Chef',
          category: 'Fine Dining',
          color: C.dining,
          x: [246, 260],
          y: PORT_OUTER,
          description: hasSilkHarvest
            ? 'Authentic Asian fusion sharing menu representing Japanese, Thai, Vietnamese, and Chinese culinary traditions.'
            : 'Whimsical animated dining experience where an animated 3D chef prepares each course right on your table.',
          tags: ['Specialty Dining'],
          aliases: hasSilkHarvest ? ['Silk Harvest', 'Pan-Asian'] : ['Qsine', 'Le Petit Chef'],
        }),
        venue(5, {
          id: 'v5-tuscan-grille',
          name: 'Tuscan Grille',
          category: 'Fine Dining',
          color: C.dining,
          x: [276, 314],
          y: FULL_BEAM_INNER,
          description: 'Italian steakhouse serving dry-aged USDA Prime steaks, handmade pasta, and regional Italian specialties overlooking the ship wake.',
          tags: ['Steakhouse', 'Italian'],
          aliases: ['Tuscan Grille', 'Tuscan Grill'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Decks 6–11 (Staterooms)
  for (let lvl = 6; lvl <= 11; lvl += 1) {
    const isBridgeDeck = lvl === 11;
    const xStart = isBridgeDeck ? 36 : 20;
    const title = isBridgeDeck ? 'Bridge & Staterooms' : lvl === 10 ? 'Staterooms, Suites & Library' : 'Staterooms & Suites';
    const category = 'Staterooms';

    const extraVenues = [];
    if (lvl === 10) {
      extraVenues.push(
        venue(10, {
          id: 'v10-library',
          name: 'The Library',
          category: 'Entertainment',
          color: C.entertainment,
          x: [156, 172],
          y: [12, 25],
          description: 'Two-story peaceful glass library corner for reading and relaxation.',
          tags: ['Library', 'Quiet'],
          aliases: ['Library'],
        })
      );
    }
    if (lvl === 11) {
      extraVenues.push(
        venue(11, {
          id: 'v11-bridge',
          name: 'Navigation Bridge',
          category: 'Guest Services',
          color: C.backOfHouse,
          x: [16, 34],
          description: 'Ship command bridge and navigational bridge wings. Crew only.',
          tags: ['Bridge', 'Crew Only'],
          aliases: ['The Bridge', 'Bridge'],
        })
      );
    }

    decks.push(
      deck(lvl, {
        title,
        category,
        description: `Guest staterooms and suites on Deck ${lvl}, with forward, midship, and aft elevator access.`,
        venues: [
          ...stateroomDeck(lvl, {
            range: [xStart, 290],
            typeFor: ({ x, row }) => {
              if (row === 'inside') return 'I2';
              if (x >= 148 && x <= 184) return 'S1'; // Midship Sky Suites
              return solsticeVeranda(x);
            },
            transom: true,
          }),
          ...extraVenues,
        ],
      })
    );
  }

  // ---------------------------------------------------------------- Deck 12 (Resort Deck)
  decks.push(
    deck(12, {
      title: 'Resort Deck, Solarium & Pools',
      category: 'Pools & Sun Deck',
      description: 'Adults-only glass-canopied Solarium, AquaSpa Café, Main Outdoor Pools, Pool Bar, Mast Bar, and Mast Grill.',
      venues: [
        venue(12, {
          id: 'v12-solarium',
          name: 'Solarium',
          category: 'Pools & Sun Deck',
          color: C.pool,
          x: [36, 80],
          y: FULL_BEAM_INNER,
          description: 'Tranquil glass-domed sanctuary for adults with a heated lap pool, whirlpool spas, and cushioned daybeds.',
          tags: ['Solarium', 'Pool', 'Adults Only'],
          access: 'adults',
          aliases: ['Solarium', 'Solarium Pool', 'Adults Pool'],
        }),
        venue(12, {
          id: 'v12-aquaspa-cafe',
          name: 'AquaSpa Café',
          category: 'Casual Dining',
          color: C.dining,
          x: [62, 78],
          y: PORT_OUTER,
          description: 'Nourishing light spa cuisine, organic smoothies, and fresh salads inside the Solarium.',
          tags: ['Spa Food', 'Healthy'],
          aliases: ['AquaSpa Cafe', 'Spa Cafe'],
        }),
        ...generateCenterlineCore(12),
        venue(12, {
          id: 'v12-main-pool',
          name: 'Resort Deck Pools',
          category: 'Pools & Sun Deck',
          color: C.pool,
          x: [98, 184],
          y: [6, 31],
          description: 'Two outdoor freshwater swimming pools surrounded by four whirlpools and teak sun deck loungers.',
          tags: ['Pool', 'Sun Deck'],
          aliases: ['Resort Deck Pools', 'Main Pool', 'Outdoor Pools'],
        }),
        venue(12, {
          id: 'v12-pool-bar',
          name: 'Pool Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [136, 154],
          y: PORT_OUTER,
          description: 'Poolside beverage station serving frozen daiquiris, craft beers, and chilled tropical cocktails.',
          tags: ['Poolside', 'Cocktails'],
          aliases: ['Pool Bar'],
        }),
        venue(12, {
          id: 'v12-mast-bar',
          name: 'Mast Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [156, 174],
          y: STBD_OUTER,
          description: 'Casual open-air bar serving refreshments overlooking the main pool deck.',
          tags: ['Bar', 'Poolside'],
          aliases: ['Mast Bar'],
        }),
        venue(12, {
          id: 'v12-mast-grill',
          name: 'Mast Grill',
          category: 'Casual Dining',
          color: C.dining,
          x: [136, 154],
          y: STBD_OUTER,
          description: 'Open-air grill serving freshly cooked burgers, hot dogs, fries, and tacos by the pool.',
          tags: ['Burgers', 'Grill'],
          aliases: ['Mast Grill', 'Mast Grill & Bar'],
        }),
        ...generateStaterooms(12, {
          range: [276, 305],
          typeFor: () => 'SV',
          transom: { corner: 'SS', middle: 'SV' },
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 14 (Oceanview Café & Spa)
  decks.push(
    deck(14, {
      title: 'Oceanview Café, Spa & Sky Lounge',
      category: 'Dining & Spa',
      description: 'Sky Observation Lounge and Canyon Ranch Spa forward, Oceanview Café buffet mid-aft, and Oceanview Bar with wake terrace aft.',
      venues: [
        venue(14, {
          id: 'v14-sky-lounge',
          name: 'Sky Observation Lounge',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [38, 80],
          y: FULL_BEAM_INNER,
          description: 'Forward panoramic observation lounge offering floor-to-ceiling vistas, sunset cocktails, and nighttime dancing.',
          tags: ['Observation', 'Cocktails', 'Panoramic'],
          aliases: ['Sky Observation Lounge', 'Sky Lounge'],
        }),
        ...generateCenterlineCore(14, ['fwd', 'mid', 'aft']),
        venue(14, {
          id: 'v14-spa',
          name: 'The Spa & Fitness Center',
          category: 'Spa & Wellness',
          color: C.spa,
          x: [96, 144],
          y: FULL_BEAM_INNER,
          description: 'Full-service Canyon Ranch wellness sanctuary featuring the Persian Garden thermal suite, acupuncture, massage, and ocean-view fitness center.',
          tags: ['Spa', 'Wellness', 'Fitness'],
          aliases: ['The Spa', 'Canyon Ranch', 'Fitness Center', 'Gym'],
        }),
        venue(14, {
          id: 'v14-persian-garden',
          name: 'Persian Garden',
          category: 'Spa & Wellness',
          color: C.spa,
          x: [146, 176],
          y: PORT_OUTER,
          description: 'Aromatherapy steam rooms, Finnish saunas, and heated ceramic loungers.',
          tags: ['Thermal Suite', 'Sauna'],
          access: 'paid',
        }),
        venue(14, {
          id: 'v14-fitness-center',
          name: 'Fitness Center',
          category: 'Spa & Wellness',
          color: C.spa,
          x: [146, 176],
          y: STBD_OUTER,
          description: 'State-of-the-art gym equipped with Technogym cardio machines, free weights, and fitness studio.',
          tags: ['Gym', 'Fitness'],
        }),
        venue(14, {
          id: 'v14-oceanview-cafe',
          name: 'Oceanview Café',
          category: 'Dining',
          color: C.dining,
          x: [200, 258],
          y: FULL_BEAM_INNER,
          description: 'Expansive buffet marketplace with live-cooking stations featuring international cuisines, stir-fry, pasta, carvings, pizza, and desserts.',
          tags: ['Buffet', 'Casual Dining'],
          aliases: ['Oceanview Café', 'Oceanview Cafe', 'Buffet', 'OVC'],
        }),
        venue(14, {
          id: 'v14-oceanview-bar',
          name: 'Oceanview Bar',
          category: 'Bars & Lounges',
          color: C.bar,
          x: [276, 298],
          y: [8, 29],
          description: 'Alfresco aft bar and shaded outdoor dining terrace overlooking the ship wake.',
          tags: ['Bar', 'Outdoor Dining'],
          aliases: ['Oceanview Bar', 'Aft Terrace'],
        }),
      ],
    })
  );

  // ---------------------------------------------------------------- Deck 15 (The Lawn Club & Sunset Bar)
  const deck15Venues = [
    venue(15, {
      id: 'v15-sports-court',
      name: 'Sports Court',
      category: 'Sports',
      color: C.entertainment,
      x: [44, 80],
      y: [8, 29],
      description: 'Outdoor open-air sports court for basketball, pickleball, and volleyball tournaments.',
      tags: ['Basketball', 'Sports'],
      aliases: ['Sports Court', 'Sport Court'],
    }),
    ...generateCenterlineCore(15, ['fwd', 'mid', 'aft']),
    venue(15, {
      id: 'v15-lawn-club',
      name: 'The Lawn Club',
      category: 'Pools & Sun Deck',
      color: C.pool,
      x: [198, 258],
      y: [6, 31],
      description: 'Celebrity Cruises signature half-acre of real manicured green grass lawn on the top deck for picnics, lawn bowling, and barefoot relaxation.',
      tags: ['Lawn Club', 'Real Grass', 'Outdoor'],
      aliases: ['The Lawn Club', 'The Lawn', 'Lawn Club'],
    }),
    venue(15, {
      id: 'v15-jogging-track',
      name: 'Jogging Track',
      category: 'Sports',
      color: C.entertainment,
      x: [98, 184],
      y: [5, 32],
      description: 'Outdoor running and walking track encircling the central pool deck void.',
      tags: ['Jogging', 'Fitness'],
      aliases: ['Jogging Track', 'Running Track'],
    }),
    venue(15, {
      id: 'v15-sunset-bar',
      name: 'Sunset Bar',
      category: 'Bars & Lounges',
      color: C.bar,
      x: [276, 304],
      y: [7, 30],
      description: 'Casual open-air aft bar located at the very stern tip of the Lawn Club, offering unimpeded 180-degree sunset ocean views.',
      tags: ['Sunset Bar', 'Aft View', 'Cocktails'],
      aliases: ['Sunset Bar', 'Aft Sunset Bar'],
    }),
  ];

  if (hasLawnClubGrill) {
    deck15Venues.push(
      venue(15, {
        id: 'v15-lawn-club-grill',
        name: 'Lawn Club Grill',
        category: 'Dining',
        color: C.dining,
        x: [226, 258],
        y: STBD_OUTER,
        description: 'Interactive open-air gourmet grill where guests cook gourmet burgers, steaks, and flatbreads alongside Celebrity chefs.',
        tags: ['Grill', 'Outdoor Dining'],
        aliases: ['Lawn Club Grill', 'The Grill'],
      }),
      venue(15, {
        id: 'v15-the-porch',
        name: 'The Porch',
        category: 'Dining',
        color: C.dining,
        x: [226, 258],
        y: PORT_OUTER,
        description: 'Casual Hamptons-style seafood raw bar and breakfast spot alongside the lawn.',
        tags: ['Seafood', 'Casual Dining'],
        aliases: ['The Porch'],
      }),
      venue(15, {
        id: 'v15-the-alcoves',
        name: 'The Alcoves',
        category: 'Pools & Sun Deck',
        color: C.pool,
        x: [156, 184],
        y: PORT_OUTER,
        description: 'Private cabanas set along the edge of The Lawn Club available for full-day rental.',
        tags: ['Cabanas'],
        access: 'paid',
        aliases: ['The Alcoves'],
      })
    );
  } else {
    deck15Venues.push(
      venue(15, {
        id: 'v15-hot-glass-show',
        name: 'Hot Glass Show',
        category: 'Entertainment',
        color: C.entertainment,
        x: [226, 258],
        y: STBD_OUTER,
        description: 'Live glassblowing demonstrations presented in partnership with the Corning Museum of Glass.',
        tags: ['Glassblowing', 'Live Show'],
        aliases: ['Hot Glass Show', 'Corning Glass'],
      }),
      venue(15, {
        id: 'v15-patio-lawn',
        name: 'Patio on the Lawn',
        category: 'Bars & Lounges',
        color: C.bar,
        x: [226, 258],
        y: PORT_OUTER,
        description: 'Shaded lounge seating area next to the lawn for afternoon cocktails and board games.',
        tags: ['Lounge', 'Patio'],
        aliases: ['Patio on the Lawn'],
      })
    );
  }

  decks.push(
    deck(15, {
      title: 'The Lawn Club & Sunset Bar',
      category: 'Pools & Sun Deck',
      description: 'The Lawn Club real manicured grass lawn, Sunset Bar at the stern, sports court forward, and specialty lawn venues.',
      venues: deck15Venues,
    })
  );

  // ---------------------------------------------------------------- Deck 16 (Solstice Deck)
  decks.push(
    deck(16, {
      title: 'Solstice Deck',
      category: 'Pools & Sun Deck',
      description: 'Forward-facing open observation sun deck with plush loungers overlooking the bow.',
      venues: [
        venue(16, {
          id: 'v16-forward-lookout',
          name: 'Forward Observation Deck',
          category: 'Pools & Sun Deck',
          color: C.pool,
          x: [50, 78],
          y: [8, 29],
          description: 'Scenic top-deck forward lookout platform overlooking the ship bow and open ocean.',
          tags: ['Observation', 'Lookout', 'Bow View'],
          aliases: ['Observation Deck', 'Bow Lookout'],
        }),
        ...generateCenterlineCore(16, ['fwd']),
        venue(16, {
          id: 'v16-solstice-deck',
          name: 'Solstice Deck',
          category: 'Pools & Sun Deck',
          color: C.pool,
          x: [98, 136],
          y: FULL_BEAM_INNER,
          description: 'Tranquil top-deck sunbathing oasis with padded loungers, daybeds, and panoramic sea views.',
          tags: ['Sun Deck', 'Loungers'],
          aliases: ['Solstice Deck', 'Sky Deck', 'Forward Sun Deck'],
        }),
      ],
    })
  );

  return decks;
}
