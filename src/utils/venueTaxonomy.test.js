import { describe, it, expect } from 'vitest';
import {
  FILTER_KEYS,
  getFilterKey,
  venueMatchesFilter,
  getLabelPriority,
  isStateroom,
} from './venueTaxonomy';

describe('getFilterKey', () => {
  it('maps free-form dining categories onto the dining filter', () => {
    expect(getFilterKey({ category: 'Fine Dining' })).toBe(FILTER_KEYS.DINING);
    expect(getFilterKey({ category: 'Culinary & Iconic Features' })).toBe(FILTER_KEYS.DINING);
    expect(getFilterKey({ category: 'Dining & Nightlife' })).toBe(FILTER_KEYS.DINING);
  });

  it('maps pool/outdoor variants onto the pool filter', () => {
    expect(getFilterKey({ category: 'Pool & Sun Deck' })).toBe(FILTER_KEYS.POOL);
    expect(getFilterKey({ category: 'Pools & Recreation' })).toBe(FILTER_KEYS.POOL);
    expect(getFilterKey({ category: 'Outdoor Sunbathing' })).toBe(FILTER_KEYS.POOL);
  });

  it('maps suite/VIP variants onto the suites filter', () => {
    expect(getFilterKey({ category: 'Suites' })).toBe(FILTER_KEYS.SUITES);
    expect(getFilterKey({ category: 'Luxury VIP Accommodations' })).toBe(FILTER_KEYS.SUITES);
  });

  it('recognizes the Magic Carpet as its own headline category', () => {
    expect(getFilterKey({ category: 'Magic Carpet' })).toBe(FILTER_KEYS.MAGIC_CARPET);
  });

  it('returns null for non-amenity spaces and missing categories', () => {
    expect(getFilterKey({ category: 'Technical Operations' })).toBeNull();
    expect(getFilterKey({ category: 'Guest Services' })).toBeNull();
    expect(getFilterKey({})).toBeNull();
    expect(getFilterKey(undefined)).toBeNull();
  });
});

describe('venueMatchesFilter', () => {
  it('always matches when the filter is ALL or empty', () => {
    expect(venueMatchesFilter({ category: 'Guest Services' }, 'ALL')).toBe(true);
    expect(venueMatchesFilter({ category: 'Guest Services' }, '')).toBe(true);
  });

  it('matches only venues in the active category', () => {
    expect(venueMatchesFilter({ category: 'Fine Dining' }, FILTER_KEYS.DINING)).toBe(true);
    expect(venueMatchesFilter({ category: 'Suites' }, FILTER_KEYS.DINING)).toBe(false);
  });
});

describe('getLabelPriority', () => {
  it('ranks the Magic Carpet above dining, and staterooms lowest', () => {
    expect(getLabelPriority({ category: 'Magic Carpet' })).toBeGreaterThan(
      getLabelPriority({ category: 'Fine Dining' })
    );
    expect(getLabelPriority({ category: 'Fine Dining' })).toBeGreaterThan(
      getLabelPriority({ category: 'Staterooms' })
    );
  });
});

describe('isStateroom', () => {
  it('detects stateroom-class venues', () => {
    expect(isStateroom({ category: 'Staterooms' })).toBe(true);
    expect(isStateroom({ category: 'Fine Dining' })).toBe(false);
  });
});
