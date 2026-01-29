/**
 * Shared string utility functions for parsers
 */

/**
 * Remove leading zeros from a numeric string, preserving at least one digit
 *
 * This is useful for normalizing account numbers and other identifiers that
 * may have leading zeros in OCR output but should be stored without them.
 *
 * @param value - String with potential leading zeros (e.g., "03101", "0000", "123")
 * @returns String with leading zeros removed (e.g., "3101", "0", "123")
 *
 * @example
 * removeLeadingZeros("03101") // "3101"
 * removeLeadingZeros("0000")  // "0" (preserves at least one digit)
 * removeLeadingZeros("123")   // "123" (no change)
 */
export function removeLeadingZeros(value: string): string {
  return value.replace(/^0+/, '') || value;
}

/**
 * Regex pattern for currency amounts with optional thousands separators
 * Matches: "1,234.56", "123.45", "1234.56"
 */
export const CURRENCY_AMOUNT_PATTERN = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}';

// Precompiled regexes for currency amounts
export const CURRENCY_AMOUNT_RE = new RegExp(CURRENCY_AMOUNT_PATTERN);
export const CURRENCY_AMOUNT_GLOBAL_RE = new RegExp(CURRENCY_AMOUNT_PATTERN, 'g');

/**
 * Parse a currency string to a number, removing thousands separators
 *
 * Handles standard US currency format with comma thousands separators.
 * Does not handle currency symbols - those should be removed before parsing.
 *
 * @param value - String with currency amount (e.g., "1,234.56", "123.45")
 * @returns Parsed number (e.g., 1234.56, 123.45)
 *
 * @example
 * parseCurrency("1,234.56") // 1234.56
 * parseCurrency("123.45")   // 123.45
 * parseCurrency("10.00")    // 10.00
 */
export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/,/g, ''));
}

/**
 * Parse a currency string that may use a trailing minus to indicate negative values
 *
 * NVL documents sometimes use trailing minus signs (e.g., "3,890.63-") to indicate
 * negative amounts. This function handles both trailing minus and standard formats.
 *
 * @param value - Currency string with optional trailing minus
 * @returns Parsed number with correct sign
 *
 * @example
 * parseSignedCurrency("3,890.63-") // -3890.63
 * parseSignedCurrency("518.00")    // 518.00
 * parseSignedCurrency("-123.45")   // -123.45 (standard format also works)
 */
export function parseSignedCurrency(value: string): number {
  const trimmed = value.trim();
  const base = parseCurrency(trimmed);
  const isTrailingMinus = trimmed.endsWith('-');
  return isTrailingMinus ? -base : base;
}
