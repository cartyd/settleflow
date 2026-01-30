import { describe, it, expect } from 'vitest';
import {
  removeLeadingZeros,
  parseCurrency,
  parseSignedCurrency,
  CURRENCY_AMOUNT_RE,
} from '../../../src/parsers/utils/string-utils.js';

describe('string-utils', () => {
  it('removeLeadingZeros removes leading zeros (keeps all-zero strings unchanged)', () => {
    expect(removeLeadingZeros('03101')).toBe('3101');
    expect(removeLeadingZeros('0000')).toBe('0000');
    expect(removeLeadingZeros('123')).toBe('123');
  });

  it('parseCurrency handles commas', () => {
    expect(parseCurrency('1,234.56')).toBe(1234.56);
    expect(parseCurrency('123.45')).toBe(123.45);
  });

  it('parseSignedCurrency supports trailing minus and explicit minus', () => {
    expect(parseSignedCurrency('1,234.56-')).toBe(-1234.56);
    expect(parseSignedCurrency('-123.45')).toBe(-123.45);
    expect(parseSignedCurrency('0.00')).toBe(0);
  });

  it('CURRENCY_AMOUNT_RE matches valid amounts', () => {
    expect(CURRENCY_AMOUNT_RE.test('1,234.56')).toBe(true);
    expect(CURRENCY_AMOUNT_RE.test('1234.56')).toBe(true);
    expect(CURRENCY_AMOUNT_RE.test('1234')).toBe(false);
  });
});
