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
