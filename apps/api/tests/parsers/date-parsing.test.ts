import { describe, it, expect } from 'vitest';

/**
 * Parse date string to valid Date or null
 * Handles: YYYY-MM-DD, MM/DD/YY, MMDDYY formats
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  
  const cleanStr = dateStr.trim();
  
  // Try MMDDYY format (6 digits, no separators) - e.g., 121625 = 12/16/25
  const compactMatch = cleanStr.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, month, day, year] = compactMatch;
    const fullYear = parseInt(`20${year}`, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    // Create date in local timezone to avoid UTC offset issues
    const date = new Date(fullYear, monthNum - 1, dayNum);
    if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
      return date;
    }
  }
  
  // Try YYYY-MM-DD format
  const isoMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const date = new Date(yearNum, monthNum - 1, dayNum);
    // Check if valid date and year is reasonable (1900-2100)
    if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
      return date;
    }
  }
  
  // Try MM/DD/YY format
  const slashMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const fullYear = parseInt(`20${year}`, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const date = new Date(fullYear, monthNum - 1, dayNum);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
}

describe('Date Parsing', () => {
  it('should parse MMDDYY format correctly', () => {
    const date = parseDate('121625');
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2025);
    expect(date?.getMonth()).toBe(11); // December (0-indexed)
    expect(date?.getDate()).toBe(16);
  });

  it('should parse another MMDDYY format', () => {
    const date = parseDate('010124');
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2024);
    expect(date?.getMonth()).toBe(0); // January
    expect(date?.getDate()).toBe(1);
  });

  it('should parse YYYY-MM-DD format', () => {
    const date = parseDate('2025-12-16');
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2025);
    expect(date?.getMonth()).toBe(11);
    expect(date?.getDate()).toBe(16);
  });

  it('should parse MM/DD/YY format', () => {
    const date = parseDate('12/16/25');
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2025);
    expect(date?.getMonth()).toBe(11);
    expect(date?.getDate()).toBe(16);
  });

  it('should return null for invalid dates', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('invalid')).toBeNull();
  });
});
