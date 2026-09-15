/**
 * Venue taxonomy normalizer.
 *
 * The deck data uses ~20 free-form `category` strings ("Fine Dining",
 * "Dining & Nightlife", "Pools & Recreation", "Outdoor Sunbathing", ...).
 * The UI filter chips, however, only understand a small fixed set of keys.
 * Comparing them with exact string matches silently dropped every venue whose
 * category did not match a key verbatim.
 *
 * This module maps any free-form category onto the canonical filter keys using
 * keyword matching, so the amenity filters and label-priority engine behave
 * predictably regardless of how a venue was authored.
 */

// Canonical filter keys used by the amenity chips. `ALL` is handled separately.
export const FILTER_KEYS = {
  MAGIC_CARPET: 'MAGIC CARPET',
  DINING: 'FINE DINING',
  BARS: 'BARS & LOUNGES',
  STATEROOMS: 'STATEROOMS',
  SUITES: 'SUITES',
  ENTERTAINMENT: 'ENTERTAINMENT',
  POOL: 'POOL & SUN DECK',
};

// Ordered keyword rules. The first rule whose keyword appears in the
// (lower-cased) category wins, so more specific rules are listed first.
const KEYWORD_RULES = [
  { key: FILTER_KEYS.MAGIC_CARPET, keywords: ['magic carpet'] },
  { key: FILTER_KEYS.SUITES, keywords: ['suite', 'villa', 'vip', 'retreat', 'penthouse'] },
  { key: FILTER_KEYS.STATEROOMS, keywords: ['stateroom', 'cabin', 'accommodation', 'oceanview', 'veranda'] },
  { key: FILTER_KEYS.DINING, keywords: ['dining', 'culinary', 'restaurant', 'cafe', 'grill', 'eatery', 'food'] },
  { key: FILTER_KEYS.BARS, keywords: ['bar', 'lounge', 'nightlife', 'club', 'pub', 'cocktail'] },
  { key: FILTER_KEYS.ENTERTAINMENT, keywords: ['entertainment', 'theater', 'theatre', 'plaza', 'show', 'casino', 'cinema'] },
  { key: FILTER_KEYS.POOL, keywords: ['pool', 'sun', 'outdoor', 'recreation', 'sport', 'deck party', 'lido'] },
];

/**
 * Returns the canonical filter key for a venue, or `null` when the venue does
 * not belong to any user-facing amenity filter (e.g. crew/technical spaces).
 * @param {{category?: string}} venue
 * @returns {string | null}
 */
export function getFilterKey(venue) {
  const category = (venue?.category ?? '').toLowerCase();
  if (!category) return null;

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => category.includes(keyword))) {
      return rule.key;
    }
  }
  return null;
}

/**
 * Whether a venue should be shown for the currently active filter.
 * @param {{category?: string}} venue
 * @param {string} activeFilter - a FILTER_KEYS value, or 'ALL'
 * @returns {boolean}
 */
export function venueMatchesFilter(venue, activeFilter) {
  if (!activeFilter || activeFilter === 'ALL') return true;
  return getFilterKey(venue) === activeFilter;
}

/**
 * Label-placement priority. Higher numbers are drawn first and win collision
 * resolution, so headline venues keep their labels while dense stateroom rows
 * yield. Derived from the canonical filter key rather than exact category text.
 * @param {{category?: string}} venue
 * @returns {number}
 */
export function getLabelPriority(venue) {
  switch (getFilterKey(venue)) {
    case FILTER_KEYS.MAGIC_CARPET:
      return 90;
    case FILTER_KEYS.ENTERTAINMENT:
    case FILTER_KEYS.DINING:
      return 80;
    case FILTER_KEYS.BARS:
    case FILTER_KEYS.POOL:
      return 70;
    case FILTER_KEYS.SUITES:
      return 40;
    case FILTER_KEYS.STATEROOMS:
      return 10;
    default:
      return 30; // Guest services, medical, technical, etc.
  }
}

/**
 * Whether a venue is an individual stateroom, used to thin labels at low zoom.
 * @param {{category?: string}} venue
 * @returns {boolean}
 */
export function isStateroom(venue) {
  return getFilterKey(venue) === FILTER_KEYS.STATEROOMS;
}
