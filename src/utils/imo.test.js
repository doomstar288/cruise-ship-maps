import { describe, it, expect } from 'vitest';
import { isValidImo, normalizeImo, expectedImoCheckDigit } from './imo';

describe('normalizeImo', () => {
  it('strips an IMO prefix and whitespace', () => {
    expect(normalizeImo(' IMO 9884136 ')).toBe('9884136');
    expect(normalizeImo('IMO:9884136')).toBe('9884136');
    expect(normalizeImo(9884136)).toBe('9884136');
  });

  it('rejects anything that is not seven digits', () => {
    expect(normalizeImo('98841')).toBeNull();
    expect(normalizeImo('98841369')).toBeNull();
    expect(normalizeImo('ABCDEFG')).toBeNull();
    expect(normalizeImo(null)).toBeNull();
  });
});

describe('isValidImo', () => {
  it('accepts real vessel IMO numbers', () => {
    expect(isValidImo('9884136')).toBe(true); // Celebrity Xcel
    expect(isValidImo('9829930')).toBe(true); // Icon of the Seas
    expect(isValidImo('9880001')).toBe(true); // Utopia of the Seas
  });

  it('rejects numbers whose check digit does not match', () => {
    // 9938430 was hardcoded in the app as Celebrity Xcel's IMO; the check digit
    // proves it is not a valid IMO number at all.
    expect(isValidImo('9938430')).toBe(false);
    expect(isValidImo('9884137')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isValidImo('')).toBe(false);
    expect(isValidImo(undefined)).toBe(false);
  });
});

describe('expectedImoCheckDigit', () => {
  it('reports the digit the first six imply', () => {
    expect(expectedImoCheckDigit('9884136')).toBe(6);
    expect(expectedImoCheckDigit('9938430')).toBe(2); // actual digit is 0
  });

  it('returns null for unusable input', () => {
    expect(expectedImoCheckDigit('123')).toBeNull();
  });
});
