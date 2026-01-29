/**
 * Shared date parsing utilities for NVL parsers
 * 
 * Handles common date formats found in NVL documents:
 * - MM/DD/YY (e.g., 12/18/25)
 * - MMDDYY (e.g., 121825)
 * 
 * Returns dates in ISO format (YYYY-MM-DD)
 */

/**
 * Get the century prefix for two-digit years (e.g., "20" for 21st century)
 * 
 * This ensures date parsing remains valid across decade boundaries.
 * As we approach year 2100, this function will automatically return "21".
 * 
 * @returns Century prefix as string (e.g., "20" for years 2000-2099)
 * 
 * @example
 * getCenturyPrefix() // "20" (in year 2025)
 */
export function getCenturyPrefix(): string {
  const currentYear = new Date().getFullYear();
  // Extract first two digits (century): 2025 -> 20, 2099 -> 20, 2100 -> 21
  return Math.floor(currentYear / 100).toString();
}

/**
 * Validate that a date has valid month (1-12) and day (1-31) values
 * 
 * Note: This performs basic range validation only. It does not check
 * for month-specific day limits (e.g., February 30th) or leap years.
 * 
 * @param month - Month value to validate (1-12)
 * @param day - Day value to validate (1-31)
 * @returns true if month and day are within valid ranges
 * 
 * @example
 * isValidDate(12, 25) // true
 * isValidDate(13, 1)  // false (month out of range)
 * isValidDate(2, 30)  // true (basic validation only, doesn't check month-specific limits)
 */
export function isValidDate(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * Parse a date string in MM/DD/YY format to ISO date string
 * Example: 12/18/25 -> 2025-12-18
 * 
 * @param dateStr - Date string in MM/DD/YY format
 * @returns ISO date string (YYYY-MM-DD) or undefined if parsing fails
 */
export function parseSlashDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  const match = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!match) return undefined;
  
  const [, month, day, year] = match;
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  
  // Validate date components
  if (!isValidDate(monthNum, dayNum)) {
    return undefined;
  }
  
  const fullYear = `${getCenturyPrefix()}${year}`;
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Parse a date string in MMDDYY format (6 digits, no separators) to ISO date string
 * Example: 121825 -> 2025-12-18
 * 
 * @param dateStr - Date string in MMDDYY format
 * @returns ISO date string (YYYY-MM-DD) or undefined if parsing fails
 */
export function parseCompactDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  const match = dateStr.trim().match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!match) return undefined;
  
  const [, month, day, year] = match;
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  
  // Validate date components
  if (!isValidDate(monthNum, dayNum)) {
    return undefined;
  }
  
  const fullYear = `${getCenturyPrefix()}${year}`;
  return `${fullYear}-${month}-${day}`;
}

/**
 * Universal date parser that attempts multiple formats
 * Tries in order: ISO format (YYYY-MM-DD), MM/DD/YY, MMDDYY
 * 
 * @param dateStr - Date string in various formats
 * @returns ISO date string (YYYY-MM-DD) or undefined if parsing fails
 */
export function parseDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  const cleanStr = dateStr.trim();
  
  // Try ISO format (YYYY-MM-DD) first - already in correct format
  const isoMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return cleanStr;
  }
  
  // Try MM/DD/YY format
  if (cleanStr.includes('/')) {
    return parseSlashDate(cleanStr);
  }
  
  // Try MMDDYY format (6 digits)
  if (/^\d{6}$/.test(cleanStr)) {
    return parseCompactDate(cleanStr);
  }
  
  return undefined;
}

/**
 * Add days to an ISO date string using UTC-safe arithmetic
 * Avoids timezone/DST drift by performing date math in UTC
 * 
 * @param isoDate - Date string in ISO format (YYYY-MM-DD)
 * @param days - Number of days to add (can be negative for subtraction)
 * @returns New ISO date string (YYYY-MM-DD)
 */
export function addDaysUtc(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
