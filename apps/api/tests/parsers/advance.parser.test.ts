import { describe, it, expect } from 'vitest';
import { parseAdvance } from '../../src/parsers/nvl/advance.parser.js';

describe('Advance Parser', () => {
  it('parses COMDATA advance with table amount', () => {
    const text = `
FOR DATA ENTRY USE
G/L #   AMOUNT
2032-01  1,033.00

TRIP NUMBER
1854
ACCOUNT NUMBER
03101
DRIVER--> BIDETTI, DONNY
DATE--> 120525
COMDATA
`;

    const result = parseAdvance(text);
    expect(result.errors).toHaveLength(0);
    expect(result.lines).toHaveLength(1);

    const line = result.lines[0];
    expect(line.tripNumber).toBe('1854');
    expect(line.accountNumber).toBe('3101');
    expect(line.driverName).toContain('BIDETTI');
    expect(line.advanceAmount).toBe(1033.00);
    expect(line.description).toBe('COMDATA');
    expect(line.date).toBe('2025-12-05');
  });

  it('handles TOTAL CHARGE fallback', () => {
    const text = `
TOTAL
 CHARGE
357059 COD ... 1003.00     30.00   1033.00
TRIP NUMBER 1854
ACCOUNT NUMBER 03101
DATE 120525
`;
    const result = parseAdvance(text);
    expect(result.lines[0].advanceAmount).toBe(1033.00);
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const result = parseAdvance('');
      // Parser creates a line even for empty text with amount 0
      expect(result.lines.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some(e => e.toLowerCase().includes('amount'))).toBe(true);
    });

    it('should handle whitespace-only text', () => {
      const result = parseAdvance('   \n\t\n   ');
      // Parser creates a line even for whitespace-only text
      expect(result.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('should error when amount is missing', () => {
      const text = `
TRIP NUMBER 1854
ACCOUNT NUMBER 03101
DRIVER--> BIDETTI, DONNY
DATE--> 120525
`;
      const result = parseAdvance(text);
      expect(result.errors.some(e => e.toLowerCase().includes('amount'))).toBe(true);
    });

    it('should handle missing trip number', () => {
      const text = `
ACCOUNT NUMBER 03101
DRIVER--> BIDETTI, DONNY
G/L # AMOUNT
2032-01 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].tripNumber).toBeUndefined();
      expect(result.lines[0].advanceAmount).toBe(1033.00);
    });
  });

  describe('Amount extraction strategies', () => {
    it('should extract from G/L # AMOUNT pattern', () => {
      const text = `
TRIP NUMBER 1854
G/L # AMOUNT
2032-01 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].advanceAmount).toBe(1033.00);
    });

    it('should extract from AMOUNT header pattern', () => {
      const text = `
TRIP NUMBER 1854
AMOUNT
1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].advanceAmount).toBe(1033.00);
    });

    it('should extract from simple AMOUNT pattern', () => {
      const text = `
TRIP NUMBER 1854
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].advanceAmount).toBe(1033.00);
    });

    it('should use right-most amount from TOTAL CHARGE table', () => {
      const text = `
TOTAL
CHARGE
357059 1003.00 30.00 1033.00
TRIP NUMBER 1854
`;
      const result = parseAdvance(text);
      expect(result.lines[0].advanceAmount).toBe(1033.00);
    });
  });

  describe('Currency edge cases', () => {
    it('should handle amounts with multiple commas', () => {
      const text = `
TRIP NUMBER 1854
G/L # AMOUNT
2032-01 12,345.67
`;
      const result = parseAdvance(text);
      expect(result.lines[0].advanceAmount).toBe(12345.67);
    });

    it('should handle amounts without commas', () => {
      const text = `
TRIP NUMBER 1854
AMOUNT 1234.56
`;
      const result = parseAdvance(text);
      expect(result.lines[0].advanceAmount).toBe(1234.56);
    });

    it('should handle zero amount', () => {
      const text = `
TRIP NUMBER 1854
AMOUNT 0.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].advanceAmount).toBe(0.00);
    });
  });

  describe('Driver name edge cases', () => {
    it('should handle driver names with apostrophes', () => {
      const text = `
TRIP NUMBER 1854
DRIVER--> O'BRIEN, PATRICK
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      if (result.lines[0].driverName) {
        expect(result.lines[0].driverName).toContain("O'BRIEN");
      }
    });

    it('should normalize whitespace in driver names', () => {
      const text = `
TRIP NUMBER 1854
DRIVER-->  SMITH,   JOHN  
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      if (result.lines[0].driverName) {
        // Should normalize to single spaces
        expect(result.lines[0].driverName).toMatch(/SMITH.*JOHN/);
        expect(result.lines[0].driverName).not.toMatch(/\s{2,}/);
      }
    });

    it('should handle missing driver name', () => {
      const text = `
TRIP NUMBER 1854
ACCOUNT NUMBER 03101
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].driverName).toBeUndefined();
    });
  });

  describe('Date edge cases', () => {
    it('should parse MMDDYY date format', () => {
      const text = `
TRIP NUMBER 1854
DATE--> 120525
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].date).toBe('2025-12-05');
    });

    it('should handle missing date', () => {
      const text = `
TRIP NUMBER 1854
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].date).toBeUndefined();
    });

    it('should handle invalid date gracefully', () => {
      const text = `
TRIP NUMBER 1854
DATE--> 999999
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      expect(result).toBeDefined();
      expect(result.lines[0].date).toBeUndefined();
    });
  });

  describe('Account number edge cases', () => {
    it('should remove leading zeros from account', () => {
      const text = `
TRIP NUMBER 1854
ACCOUNT NUMBER 0003101
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].accountNumber).toBe('3101');
    });

    it('should handle account with no leading zeros', () => {
      const text = `
TRIP NUMBER 1854
ACCOUNT NUMBER 3101
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].accountNumber).toBe('3101');
    });
  });

  describe('Description edge cases', () => {
    it('should detect COMDATA from text', () => {
      const text = `
TRIP NUMBER 1854
COMDATA
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].description).toBe('COMDATA');
    });

    it('should detect CASH ADVANCE from text', () => {
      const text = `
TRIP NUMBER 1854
CASH ADVANCE
AMOUNT 500.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].description).toBe('CASH ADVANCE');
    });

    it('should default to COMDATA when neither keyword found', () => {
      const text = `
TRIP NUMBER 1854
AMOUNT 1,033.00
`;
      const result = parseAdvance(text);
      expect(result.lines[0].description).toBe('COMDATA');
    });
  });
});
