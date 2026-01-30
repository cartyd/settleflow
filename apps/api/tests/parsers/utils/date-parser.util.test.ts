import { describe, it, expect } from 'vitest';
import {
  getCenturyPrefix,
  isValidDate,
  parseSlashDate,
  parseCompactDate,
  parseDate,
  addDaysUtc,
} from '../../../src/parsers/utils/date-parser.js';

describe('date-parser utils', () => {
  it('getCenturyPrefix matches current century', () => {
    const expected = Math.floor(new Date().getFullYear() / 100).toString();
    expect(getCenturyPrefix()).toBe(expected);
  });

  it('isValidDate basic ranges', () => {
    expect(isValidDate(12, 25)).toBe(true);
    expect(isValidDate(0, 10)).toBe(false);
    expect(isValidDate(13, 1)).toBe(false);
    expect(isValidDate(2, 30)).toBe(true); // range-only validation
  });

  it('parseSlashDate parses MM/DD/YY to ISO', () => {
    expect(parseSlashDate('12/18/25')).toBe('2025-12-18');
    expect(parseSlashDate(' 01/05/26 ')).toBe('2026-01-05');
    expect(parseSlashDate('bad')).toBeUndefined();
  });

  it('parseCompactDate parses MMDDYY to ISO', () => {
    expect(parseCompactDate('121625')).toBe('2025-12-16');
    expect(parseCompactDate('010126')).toBe('2026-01-01');
    expect(parseCompactDate('')).toBeUndefined();
    expect(parseCompactDate(undefined as unknown as string)).toBeUndefined();
  });

  it('parseDate handles slash and compact formats and invalid', () => {
    expect(parseDate('12/02/25')).toBe('2025-12-02');
    expect(parseDate('120225')).toBe('2025-12-02');
    expect(parseDate('2025-12-02')).toBe('2025-12-02');
    expect(parseDate('invalid')).toBeUndefined();
    expect(parseDate(undefined as unknown as string)).toBeUndefined();
  });

  it('addDaysUtc adds correctly without timezone drift', () => {
    expect(addDaysUtc('2025-12-25', 7)).toBe('2026-01-01');
    expect(addDaysUtc('2025-02-27', 2)).toBe('2025-03-01');
  });
});
