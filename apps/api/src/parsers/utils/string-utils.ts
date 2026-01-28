/**
 * Shared string utility functions for parsers
 */

/**
 * Remove leading zeros from a numeric string, preserving at least one digit
 * @param value - String with potential leading zeros (e.g., "03101", "0000", "123")
 * @returns String with leading zeros removed (e.g., "3101", "0", "123")
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
 * @param value - String with currency amount (e.g., "1,234.56", "123.45")
 * @returns Parsed number (e.g., 1234.56, 123.45)
 */
export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/,/g, ''));
}

/**
 * Parse a currency string that may use a trailing minus to indicate negative values
 * Examples: "3,890.63-" -> -3890.63, "518.00" -> 518.00
 */
export function parseSignedCurrency(value: string): number {
  const trimmed = value.trim();
  const base = parseCurrency(trimmed);
  const isTrailingMinus = trimmed.endsWith('-');
  return isTrailingMinus ? -base : base;
}
