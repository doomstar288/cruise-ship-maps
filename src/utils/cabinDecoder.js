/**
 * Cabin Decoder & Cruise Telemetry Engine.
 *
 * Provides intelligent parsing, deck extraction, port/starboard parity determination,
 * longitudinal zone calculation (Forward, Midship, Aft), and category inference
 * for cruise cabin numbers across Celebrity Edge, Solstice, and Millennium classes.
 */

/**
 * Standard stateroom categories supported across the fleet.
 */
export const CABIN_CATEGORIES = {
  SUITE: 'Suite',
  AQUA_CLASS: 'AquaClass',
  CONCIERGE: 'Concierge',
  VERANDA: 'Veranda',
  OCEAN_VIEW: 'Ocean View',
  INSIDE: 'Inside',
};

/**
 * Signature fleetwide amenities catalog with ship class coverage and availability.
 */
export const SIGNATURE_FLEET_VENUES = [
  {
    id: 'lawn-club',
    name: 'The Lawn Club',
    aliases: ['lawn club', 'lawn club grill', 'the lawn club', 'real grass'],
    category: 'Pools & Deck',
    shipClass: 'Solstice Class',
    shipCount: 5,
    ships: [
      'Celebrity Solstice',
      'Celebrity Equinox',
      'Celebrity Eclipse',
      'Celebrity Silhouette',
      'Celebrity Reflection',
    ],
    description:
      'Half an acre of real, manicured Kentucky bluegrass lawn on the top deck for picnics, lawn games, and sunset concerts.',
    availableOnShipIds: [], // Solstice class fleet
  },
  {
    id: 'magic-carpet',
    name: 'Magic Carpet',
    aliases: ['magic carpet', 'cantilever', 'floating platform', 'magic carpet bar'],
    category: 'Bars',
    shipClass: 'Edge Series',
    shipCount: 5,
    ships: [
      'Celebrity Edge',
      'Celebrity Apex',
      'Celebrity Beyond',
      'Celebrity Ascent',
      'Celebrity Xcel',
    ],
    description:
      'The world’s first cantilevered, floating platform that scales 13 stories, functioning as a tender boarding station, bar, or fine dining venue.',
    availableOnShipIds: [
      'celebrity-edge',
      'celebrity-apex',
      'celebrity-beyond',
      'celebrity-ascent',
      'celebrity-xcel',
    ],
  },
  {
    id: 'eden',
    name: 'Eden',
    aliases: ['eden', 'eden restaurant', 'eden bar', 'eden cafe'],
    category: 'Entertainment',
    shipClass: 'Edge Series (Edge, Apex, Beyond, Ascent)',
    shipCount: 4,
    ships: ['Celebrity Edge', 'Celebrity Apex', 'Celebrity Beyond', 'Celebrity Ascent'],
    description:
      'A transformative multi-deck experiential venue combining three stories of panoramic glass, experiential gastronomy, and live performance art.',
    availableOnShipIds: ['celebrity-beyond', 'celebrity-ascent', 'celebrity-apex', 'celebrity-edge'],
    noteOnCurrent: (shipId) =>
      shipId === 'celebrity-xcel' ? 'Replaced by The Bazaar on Celebrity Xcel' : null,
  },
  {
    id: 'the-bazaar',
    name: 'The Bazaar',
    aliases: ['bazaar', 'the bazaar'],
    category: 'Entertainment',
    shipClass: 'Edge Series (Celebrity Xcel Exclusive)',
    shipCount: 1,
    ships: ['Celebrity Xcel'],
    description:
      'Exclusive multi-level sensory marketplace on Celebrity Xcel featuring world markets, cultural gastronomy, and pop-up retail.',
    availableOnShipIds: ['celebrity-xcel'],
  },
  {
    id: 'le-voyage',
    name: 'Le Voyage by Daniel Boulud',
    aliases: ['le voyage', 'daniel boulud', 'voyage'],
    category: 'Dining',
    shipClass: 'Edge Series (Beyond, Ascent, Xcel)',
    shipCount: 3,
    ships: ['Celebrity Beyond', 'Celebrity Ascent', 'Celebrity Xcel'],
    description:
      'Intimate signature restaurant by Chef Daniel Boulud featuring globally-inspired fine dining with world-class wine pairings.',
    availableOnShipIds: ['celebrity-beyond', 'celebrity-ascent', 'celebrity-xcel'],
  },
  {
    id: 'sunset-bar',
    name: 'Sunset Bar',
    aliases: ['sunset bar', 'sunset', 'aft bar'],
    category: 'Bars',
    shipClass: 'Fleetwide (Edge Series, Solstice, Millennium)',
    shipCount: 14,
    ships: [
      'Celebrity Xcel',
      'Celebrity Ascent',
      'Celebrity Beyond',
      'Celebrity Apex',
      'Celebrity Edge',
      'Solstice Class (5)',
      'Millennium Class (4)',
    ],
    description:
      'Casually sophisticated open-air aft terrace bar with panoramic wake views, Moroccan-inspired design on Edge class by Nate Berkus.',
    availableOnShipIds: [
      'celebrity-xcel',
      'celebrity-ascent',
      'celebrity-beyond',
      'celebrity-apex',
      'celebrity-edge',
    ],
  },
  {
    id: 'martini-bar',
    name: 'Martini Bar & Crush',
    aliases: ['martini bar', 'martini', 'crush', 'ice bar'],
    category: 'Bars',
    shipClass: 'Fleetwide (Edge Series, Solstice, Millennium)',
    shipCount: 14,
    ships: [
      'Celebrity Xcel',
      'Celebrity Ascent',
      'Celebrity Beyond',
      'Celebrity Apex',
      'Celebrity Edge',
      'Solstice Class (5)',
      'Millennium Class (4)',
    ],
    description:
      'Iconic frosted ice-topped bar with chandelier flair bartending, cocktail flights, and high-energy music in the Grand Plaza.',
    availableOnShipIds: [
      'celebrity-xcel',
      'celebrity-ascent',
      'celebrity-beyond',
      'celebrity-apex',
      'celebrity-edge',
    ],
  },
  {
    id: 'solarium',
    name: 'The Solarium',
    aliases: ['solarium', 'adult pool', 'glass pool'],
    category: 'Pools & Deck',
    shipClass: 'Fleetwide (Edge Series, Solstice, Millennium)',
    shipCount: 14,
    ships: [
      'Celebrity Xcel',
      'Celebrity Ascent',
      'Celebrity Beyond',
      'Celebrity Apex',
      'Celebrity Edge',
      'Solstice Class (5)',
      'Millennium Class (4)',
    ],
    description:
      'Adults-only indoor sanctuary with glass canopy, heated pool, whirlpool spas, daybeds, and Spa Cafe.',
    availableOnShipIds: [
      'celebrity-xcel',
      'celebrity-ascent',
      'celebrity-beyond',
      'celebrity-apex',
      'celebrity-edge',
    ],
  },
  {
    id: 'the-annex',
    name: 'The Annex',
    aliases: ['the annex', 'annex', 'golf simulator', 'simulator'],
    category: 'Entertainment',
    shipClass: 'Edge Series (Ascent & Xcel)',
    shipCount: 2,
    ships: ['Celebrity Ascent', 'Celebrity Xcel'],
    description:
      'Private multi-sport virtual simulator lounge for interactive golf, baseball, soccer, karaoke, and gaming screenings.',
    availableOnShipIds: ['celebrity-ascent', 'celebrity-xcel'],
  },
];

/**
 * Checks if a search query matches signature amenities and determines fleet availability.
 *
 * @param {string} query Search input
 * @param {string} currentShipId Currently selected ship ID (e.g. 'celebrity-xcel')
 * @returns {object|null}
 */
export function findFleetAmenity(query, currentShipId) {
  if (!query || typeof query !== 'string') return null;
  const q = query.trim().toLowerCase();
  if (q.length < 3) return null;

  for (const amenity of SIGNATURE_FLEET_VENUES) {
    const matched = amenity.aliases.some((alias) => alias.includes(q) || q.includes(alias));
    if (matched) {
      const isOnCurrentShip = amenity.availableOnShipIds.includes(currentShipId);
      // Select a target ship to switch to if not on current ship
      const candidateShips = amenity.availableOnShipIds.filter((id) => id !== currentShipId);
      const switchTargetShipId = !isOnCurrentShip && candidateShips.length > 0 ? candidateShips[0] : null;

      return {
        ...amenity,
        isOnCurrentShip,
        switchTargetShipId,
        customNote: typeof amenity.noteOnCurrent === 'function' ? amenity.noteOnCurrent(currentShipId) : null,
      };
    }
  }
  return null;
}

/**
 * Parses raw cabin input into components.
 * Supports: "8124", "10101", "7206", "c10-10100", "c8-8124", "Deck 10 - 10100", "Cabin 8124", "#8124", "8124 inside".
 */
function parseCabinInput(input) {
  if (input === null || input === undefined) return null;
  const str = String(input).trim();
  if (!str) return null;

  // Format: c<deck>-<cabin> e.g. "c10-10100", "c8-8124"
  const idMatch = str.match(/^c?(\d{1,2})[-_](\d{3,5})([a-z]?)$/i);
  if (idMatch) {
    const deckLevel = parseInt(idMatch[1], 10);
    const rawDigits = idMatch[2];
    const suffix = idMatch[3] ? idMatch[3].toUpperCase() : '';
    const cabinNumber = `${rawDigits}${suffix}`;
    const numPart = parseInt(rawDigits, 10);
    const seq = rawDigits.length >= 4 ? parseInt(rawDigits.slice(rawDigits.length >= 5 ? 2 : 1), 10) : numPart;
    return { deckLevel, cabinNumber, numPart, seq, rawDigits };
  }

  // Remove common words like "deck", "cabin", "stateroom", "rm", "#" and category hints
  let cleaned = str
    .replace(/\b(deck|cabin|stateroom|room|rm|inside|suite|aquaclass|aqua|concierge|veranda|balcony|oceanview|ocean\s*view)\b/gi, '')
    .replace(/[#\s]/g, '')
    .trim();

  // Hyphenated without "c": e.g. "10-10100", "8-8124"
  const hyphenMatch = cleaned.match(/^(\d{1,2})[-_](\d{3,5})([a-z]?)$/i);
  if (hyphenMatch) {
    const deckLevel = parseInt(hyphenMatch[1], 10);
    const rawDigits = hyphenMatch[2];
    const suffix = hyphenMatch[3] ? hyphenMatch[3].toUpperCase() : '';
    const cabinNumber = `${rawDigits}${suffix}`;
    const numPart = parseInt(rawDigits, 10);
    const seq = rawDigits.length >= 4 ? parseInt(rawDigits.slice(rawDigits.length >= 5 ? 2 : 1), 10) : numPart;
    return { deckLevel, cabinNumber, numPart, seq, rawDigits };
  }

  // Numeric string with optional trailing letter: "8124", "10101", "7206A"
  const digitsMatch = cleaned.match(/^(\d{3,5})([a-z]?)$/i);
  if (!digitsMatch) return null;

  const rawDigits = digitsMatch[1];
  const suffix = digitsMatch[2] ? digitsMatch[2].toUpperCase() : '';
  const cabinNumber = `${rawDigits}${suffix}`;
  const numPart = parseInt(rawDigits, 10);

  let deckLevel;
  let seq;
  if (rawDigits.length === 5) {
    deckLevel = parseInt(rawDigits.slice(0, 2), 10);
    seq = parseInt(rawDigits.slice(2), 10);
  } else if (rawDigits.length === 4) {
    deckLevel = parseInt(rawDigits.slice(0, 1), 10);
    seq = parseInt(rawDigits.slice(1), 10);
  } else if (rawDigits.length === 3) {
    deckLevel = parseInt(rawDigits.slice(0, 1), 10);
    seq = parseInt(rawDigits.slice(1), 10);
  } else {
    return null;
  }

  return { deckLevel, cabinNumber, numPart, seq, rawDigits };
}

/**
 * Determines longitudinal zone based on standard cruise stateroom numbering conventions:
 * Forward (lowest sequence), Midship, Aft (highest sequence).
 */
function determineZone(seq) {
  if (typeof seq !== 'number' || isNaN(seq)) return 'Midship';
  // Standard 3-digit sequence (0-360+ on 4/5-digit cabins):
  // 000-179: Forward (e.g. 8045, 9080, 8124, 10101)
  // 180-279: Midship (e.g. 7206, 6240, 11200)
  // 280+: Aft (e.g. 9350, 9285, 8350)
  if (seq < 180) return 'Forward';
  if (seq < 280) return 'Midship';
  return 'Aft';
}

/**
 * Infers likely stateroom category if not explicitly available in ship venues.
 * Returns one of: 'Suite', 'AquaClass', 'Concierge', 'Veranda', 'Ocean View', 'Inside'.
 */
function inferCategory(deckLevel, rawInput, matchingVenue = null) {
  if (matchingVenue) {
    const cat = matchingVenue.category || '';
    const name = (matchingVenue.name || '').toLowerCase();
    const code = (matchingVenue.cabinClass || '').toUpperCase();

    if (cat === 'Suites' || name.includes('suite') || ['S1', 'AS', 'MS', 'SS', 'CS', 'RS', 'PS', 'IC', 'EV'].includes(code)) {
      return CABIN_CATEGORIES.SUITE;
    }
    if (name.includes('aquaclass') || name.includes('aqua') || ['A1', 'A2', 'AS'].includes(code)) {
      return CABIN_CATEGORIES.AQUA_CLASS;
    }
    if (name.includes('concierge') || ['C1', 'C2', 'C3'].includes(code)) {
      return CABIN_CATEGORIES.CONCIERGE;
    }
    if (name.includes('inside') || code === 'I2') {
      return CABIN_CATEGORIES.INSIDE;
    }
    if (name.includes('oceanview') || name.includes('ocean view') || ['O2', 'PO', 'DO'].includes(code)) {
      return CABIN_CATEGORIES.OCEAN_VIEW;
    }
    if (name.includes('veranda') || name.includes('balcony') || ['E1', 'E3', 'SV', 'ES'].includes(code)) {
      return CABIN_CATEGORIES.VERANDA;
    }
  }

  // Check explicit clues in raw input string
  const inputLower = String(rawInput || '').toLowerCase();
  if (inputLower.includes('inside')) return CABIN_CATEGORIES.INSIDE;
  if (inputLower.includes('suite')) return CABIN_CATEGORIES.SUITE;
  if (inputLower.includes('aqua')) return CABIN_CATEGORIES.AQUA_CLASS;
  if (inputLower.includes('concierge')) return CABIN_CATEGORIES.CONCIERGE;
  if (inputLower.includes('ocean') || inputLower.includes('view')) return CABIN_CATEGORIES.OCEAN_VIEW;
  if (inputLower.includes('veranda') || inputLower.includes('balcony')) return CABIN_CATEGORIES.VERANDA;

  // Infer based on deck level conventions across Celebrity ships (Edge, Solstice, Millennium)
  if (deckLevel >= 14) return CABIN_CATEGORIES.SUITE;
  if (deckLevel === 11 || deckLevel === 12) return CABIN_CATEGORIES.AQUA_CLASS;
  if (deckLevel === 9 || deckLevel === 10) return CABIN_CATEGORIES.CONCIERGE;
  if (deckLevel >= 6 && deckLevel <= 8) return CABIN_CATEGORIES.VERANDA;
  if (deckLevel >= 2 && deckLevel <= 5) return CABIN_CATEGORIES.OCEAN_VIEW;
  return CABIN_CATEGORIES.INSIDE;
}

/**
 * Intelligent parser and telemetry engine for cruise cabin numbers.
 *
 * @param {string|number} input Numeric or alphanumeric cabin input (e.g. "8124", "10101", "7206", "c10-10100")
 * @param {object} [shipMetadata] Optional ship metadata or object containing decks
 * @returns {{
 *   isValid: boolean,
 *   deckLevel: number | null,
 *   side: 'Port' | 'Starboard' | null,
 *   zone: 'Forward' | 'Midship' | 'Aft' | null,
 *   cabinNumber: string | null,
 *   fullId: string | null,
 *   suggestedCategory: string | null,
 * }}
 */
export function decodeCabinNumber(input, shipMetadata) {
  const parsed = parseCabinInput(input);
  if (!parsed) {
    return {
      isValid: false,
      deckLevel: null,
      side: null,
      zone: null,
      cabinNumber: null,
      fullId: null,
      suggestedCategory: null,
    };
  }

  const { deckLevel, cabinNumber, numPart, seq } = parsed;

  // Deck level validation
  const maxDecks = shipMetadata?.totalDecks || 20;
  if (deckLevel < 1 || deckLevel > maxDecks) {
    return {
      isValid: false,
      deckLevel: null,
      side: null,
      zone: null,
      cabinNumber: null,
      fullId: null,
      suggestedCategory: null,
    };
  }

  // Parity determines side: Odd = Port, Even = Starboard
  const side = numPart % 2 === 0 ? 'Starboard' : 'Port';

  // Zone determination (Forward, Midship, Aft)
  let zone = determineZone(seq);

  // Check if matching deck and venue exist in provided metadata to refine zone & category
  let matchingVenue = null;
  if (shipMetadata?.decks && Array.isArray(shipMetadata.decks)) {
    const deck = shipMetadata.decks.find((d) => d.level === deckLevel);
    if (deck?.venues) {
      matchingVenue = deck.venues.find(
        (v) =>
          v.id === `c${deckLevel}-${cabinNumber}` ||
          v.label === cabinNumber ||
          v.id === cabinNumber
      );
      if (matchingVenue?.center) {
        const x = matchingVenue.center[0];
        if (x < 125) zone = 'Forward';
        else if (x <= 205) zone = 'Midship';
        else zone = 'Aft';
      }
    }
  }

  const fullId = `c${deckLevel}-${cabinNumber}`;
  const suggestedCategory = inferCategory(deckLevel, input, matchingVenue);

  return {
    isValid: true,
    deckLevel,
    side,
    zone,
    cabinNumber,
    fullId,
    suggestedCategory,
  };
}

/**
 * Searches active decks for exact or matching stateroom venue ID or name.
 * Returns the matching venue object + deck object, or the decoded preview if exact venue isn't labeled.
 *
 * @param {Array<object>} decks Active ship decks array
 * @param {string|number} cabinQuery Cabin query string or number
 * @returns {{
 *   venue: object | null,
 *   deck: object | null,
 *   decoded: object,
 *   isExactMatch: boolean,
 * }}
 */
export function findCabinInDecks(decks, cabinQuery) {
  const decoded = decodeCabinNumber(cabinQuery, { decks });
  if (!decoded.isValid || !decks || !Array.isArray(decks) || decks.length === 0) {
    return { venue: null, deck: null, decoded, isExactMatch: false };
  }

  const targetDeck = decks.find((d) => d.level === decoded.deckLevel);
  const candidateVenues = targetDeck ? targetDeck.venues : decks.flatMap((d) => d.venues);

  // Search for matching venue by fullId, label, or name
  const exactVenue = candidateVenues.find((v) => {
    if (v.id === decoded.fullId) return true;
    if (v.label === decoded.cabinNumber) return true;
    if (v.id === `c${decoded.cabinNumber}`) return true;
    const nameLower = (v.name || '').toLowerCase();
    return (
      nameLower === `stateroom ${decoded.cabinNumber}`.toLowerCase() ||
      nameLower.startsWith(`stateroom ${decoded.cabinNumber} `) ||
      nameLower.includes(` ${decoded.cabinNumber} `) ||
      nameLower.endsWith(` ${decoded.cabinNumber}`)
    );
  });

  if (exactVenue) {
    const venueDeck = targetDeck || decks.find((d) => d.venues.some((v) => v.id === exactVenue.id));
    return {
      venue: exactVenue,
      deck: venueDeck,
      decoded: {
        ...decoded,
        suggestedCategory: exactVenue.category === 'Suites' ? CABIN_CATEGORIES.SUITE : decoded.suggestedCategory,
      },
      isExactMatch: true,
    };
  }

  // Exact venue is not labeled in active geometry; synthesize decoded preview
  const isSuite = decoded.suggestedCategory === CABIN_CATEGORIES.SUITE;
  const previewVenue = {
    id: decoded.fullId,
    name: `Stateroom ${decoded.cabinNumber} (${decoded.suggestedCategory})`,
    label: decoded.cabinNumber,
    category: isSuite ? 'Suites' : 'Staterooms',
    cabinClass: decoded.suggestedCategory,
    color: isSuite ? 'hsl(38, 92%, 50%)' : 'hsl(215, 80%, 65%)',
    side: decoded.side,
    zone: decoded.zone,
    deckLevel: decoded.deckLevel,
    deckNumber: decoded.deckLevel,
    isSimulatedPreview: true,
  };

  return {
    venue: previewVenue,
    deck: targetDeck || null,
    decoded,
    isExactMatch: false,
  };
}
