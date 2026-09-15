/**
 * IMO ship identification number utilities.
 *
 * An IMO number is 7 digits where the 7th is a check digit: multiply the first
 * six digits by 7, 6, 5, 4, 3, 2 respectively, sum them, and the last digit of
 * that sum must equal the check digit. This lets us verify a vessel identifier
 * without calling any external service — useful for catching typos and
 * placeholder values in imported data.
 */

/** Strips an optional "IMO " prefix and surrounding whitespace. */
export function normalizeImo(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value)
    .trim()
    .replace(/^IMO[\s:-]*/i, '');
  return /^\d{7}$/.test(digits) ? digits : null;
}

/**
 * Validates an IMO number's check digit.
 * @param {string|number} value
 * @returns {boolean} true only for a well-formed IMO with a correct check digit
 */
export function isValidImo(value) {
  const imo = normalizeImo(value);
  if (!imo) return false;

  let sum = 0;
  for (let i = 0; i < 6; i += 1) {
    sum += Number(imo[i]) * (7 - i);
  }
  return sum % 10 === Number(imo[6]);
}

/**
 * Returns the check digit an IMO's first six digits imply, or null if the input
 * is not six or seven digits. Handy for reporting *what* a typo should be.
 * @param {string|number} value
 * @returns {number|null}
 */
export function expectedImoCheckDigit(value) {
  const digits = String(value ?? '')
    .trim()
    .replace(/^IMO[\s:-]*/i, '');
  if (!/^\d{6,7}$/.test(digits)) return null;

  let sum = 0;
  for (let i = 0; i < 6; i += 1) {
    sum += Number(digits[i]) * (7 - i);
  }
  return sum % 10;
}
