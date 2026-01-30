import { describe, it, expect } from 'vitest';

import { parseRevenueDistribution } from '../../src/parsers/nvl/revenue-distribution.parser.js';

describe('Revenue Distribution Parser', () => {
  describe('Driver name extraction', () => {
    const testCases = [
      {
        name: 'single line format with comma (Last, First)',
        text: `FOR SERVICE PERFORMED BY

AGENCY/ SMITH, JOHN

TRIP NUMBER
123

NET BALANCE 100.00
DUE ACCOUNT`,
        expected: {
          driverName: 'SMITH, JOHN',
          driverFirstName: 'JOHN',
          driverLastName: 'SMITH',
        },
      },
      {
        name: 'multi-line format (incomplete name continues on next line)',
        text: `FOR SERVICE PERFORMED BY

AGENCY/ PARTIAL NAME

DOE, JANE

TRIP NUMBER
456

NET BALANCE 200.00
DUE ACCOUNT`,
        expected: {
          driverName: 'DOE, JANE',
          driverFirstName: 'JANE',
          driverLastName: 'DOE',
        },
      },
      {
        name: 'should not capture ACCOUNT NUMBER as driver name',
        text: `FOR SERVICE PERFORMED BY

AGENCY/ INCOMPLETE

ACCOUNT NUMBER TRIP NUMBER
123 789

NET BALANCE 300.00
DUE ACCOUNT`,
        expected: {
          driverName: 'INCOMPLETE',
        },
      },
    ];

    testCases.forEach(({ name, text, expected }) => {
      it(name, () => {
        const result = parseRevenueDistribution(text);
        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].driverName).toBe(expected.driverName);
        if (expected.driverFirstName) {
          expect(result.lines[0].driverFirstName).toBe(expected.driverFirstName);
        }
        if (expected.driverLastName) {
          expect(result.lines[0].driverLastName).toBe(expected.driverLastName);
        }
      });
    });
  });

  describe('Origin and destination extraction', () => {
    it('should extract from combined line with date', () => {
      const text = `TRIP NUMBER
123

ORIGIN DESTINATION SIT DELIVERED DATE CUT DATE

NEW YORK NY LOS ANGELES CA 12 15 5

NET BALANCE 500.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].origin).toBe('NEW YORK, NY');
      expect(result.lines[0].destination).toBe('LOS ANGELES, CA');
    });

    it('should extract from separate lines', () => {
      const text = `TRIP NUMBER
456

ORIGIN

BOSTON MA

DESTINATION

MIAMI

FL

NET BALANCE 600.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].origin).toBe('BOSTON, MA');
      expect(result.lines[0].destination).toBe('MIAMI, FL');
    });

    it('should handle multi-word city names', () => {
      const text = `TRIP NUMBER
789

ORIGIN DESTINATION

SAN FRANCISCO CA NEW ORLEANS LA 11 20 5

NET BALANCE 700.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].origin).toBe('SAN FRANCISCO, CA');
      expect(result.lines[0].destination).toBe('NEW ORLEANS, LA');
    });
  });

  describe('Date extraction', () => {
    it('should extract from ORIGIN section with space-separated format', () => {
      const text = `TRIP NUMBER
111

ORIGIN DESTINATION

CITY ST DEST MD 12 25 5

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBe('2025-12-25');
    });

    it('should extract from ORIGIN section with dot-separated format', () => {
      const text = `TRIP NUMBER
222

ORIGIN

CITY ST

DEST

OH 11.19        5

NET BALANCE 200.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBe('2025-11-19');
    });

    it('should use ORIGIN section date, not earlier COD date', () => {
      const text = `TRIP NUMBER
333

357236/ SHIPPER COD 2 12 5 516

ORIGIN DESTINATION

CITY ST DEST MD 12 25 5

NET BALANCE 300.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      // Should extract 12/25 from ORIGIN, not 2/12 from COD line
      expect(result.lines[0].deliveryDate).toBe('2025-12-25');
    });

    it('should extract date with P-code anchor (standard format)', () => {
      const text = `TRIP NUMBER
444

ORIGIN DESTINATION

CITY ST DEST MD 11 29 5 P65

NET BALANCE 400.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBe('2025-11-29');
    });

    it('should extract date with P-code anchor (P62 format)', () => {
      const text = `TRIP NUMBER
555

ORIGIN

CITY ST 12 1 5 P62

NET BALANCE 500.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBe('2025-12-01');
    });

    it('should handle OCR merged day+year with P-code', () => {
      const text = `TRIP NUMBER
666

ORIGIN

CITY ST 12 15 P62

NET BALANCE 600.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      // "12 15 P62" should be parsed as month=12, day=1, year=5
      expect(result.lines[0].deliveryDate).toBe('2025-12-01');
    });

    it('should extract from DELIVERY DATE header', () => {
      const text = `TRIP NUMBER
777

DELIVERY
DATE
11 30 5

NET BALANCE 700.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBe('2025-11-30');
    });
  });

  describe('Required fields', () => {
    it('should extract trip number', () => {
      const text = `TRIP NUMBER
999

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].tripNumber).toBe('999');
    });

    it('should extract net balance', () => {
      const text = `TRIP NUMBER
888

NET BALANCE 1234.56
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].netBalance).toBe(1234.56);
    });

    it('should report error when trip number is missing', () => {
      const text = `NET BALANCE 100.00`;

      const result = parseRevenueDistribution(text);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.toLowerCase().includes('trip number'))).toBe(true);
    });

    it('should report error when net balance is missing', () => {
      const text = `TRIP NUMBER
777`;

      const result = parseRevenueDistribution(text);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.toLowerCase().includes('net balance'))).toBe(true);
    });
  });

  describe('Optional fields', () => {
    it('should extract bill of lading', () => {
      const text = `TRIP NUMBER
777

BILL OF LADING
123456/ 789012/

NET BALANCE 400.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].billOfLading).toBe('123456');
    });

    it('should extract shipper name from BOL line', () => {
      const text = `TRIP NUMBER
666

357236/ ACME COD

NET BALANCE 500.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].shipperName).toBe('ACME');
    });

    it('should handle missing optional fields without error', () => {
      const text = `TRIP NUMBER
555

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].tripNumber).toBe('555');
      expect(result.lines[0].netBalance).toBe(100.0);
      expect(result.lines[0].driverName).toBeUndefined();
      expect(result.lines[0].origin).toBeUndefined();
      expect(result.lines[0].destination).toBeUndefined();
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const result = parseRevenueDistribution('');
      expect(result.lines).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle whitespace-only text', () => {
      const result = parseRevenueDistribution('   \n\t\n   ');
      expect(result.lines).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle malformed text gracefully', () => {
      const text = `RANDOM TEXT
NO STRUCTURE
GARBAGE DATA`;

      const result = parseRevenueDistribution(text);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should parse valid document without errors', () => {
      const text = `TRIP NUMBER
123

FOR SERVICE PERFORMED BY

AGENCY/ DRIVER, TEST

ORIGIN DESTINATION

CITY ST DEST MD 12 25 5

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.errors).toHaveLength(0);
      expect(result.lines).toHaveLength(1);
    });
  });

  describe('Date edge cases', () => {
    it('should reject invalid month (13)', () => {
      const text = `TRIP NUMBER
111

ORIGIN DESTINATION

CITY ST DEST MD 13 25 5

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      // Invalid date should not be extracted
      expect(result.lines[0].deliveryDate).toBeUndefined();
    });

    it('should reject invalid day (32)', () => {
      const text = `TRIP NUMBER
222

ORIGIN DESTINATION

CITY ST DEST MD 12 32 5

NET BALANCE 200.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBeUndefined();
    });

    it('should reject month 0', () => {
      const text = `TRIP NUMBER
333

ORIGIN DESTINATION

CITY ST DEST MD 0 15 5

NET BALANCE 300.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBeUndefined();
    });

    it('should reject day 0', () => {
      const text = `TRIP NUMBER
444

ORIGIN DESTINATION

CITY ST DEST MD 12 0 5

NET BALANCE 400.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBeUndefined();
    });
  });

  describe('Currency edge cases', () => {
    it('should handle negative net balance', () => {
      const text = `TRIP NUMBER
555

NET BALANCE -123.45
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].netBalance).toBe(-123.45);
    });

    it('should handle zero net balance', () => {
      const text = `TRIP NUMBER
666

NET BALANCE 0.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].netBalance).toBe(0.0);
    });

    it('should handle large amounts with thousands separators', () => {
      const text = `TRIP NUMBER
777

NET BALANCE 123,456.78
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].netBalance).toBe(123456.78);
    });

    it('should handle multiple thousands separators', () => {
      const text = `TRIP NUMBER
888

NET BALANCE 1,234,567.89
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].netBalance).toBe(1234567.89);
    });
  });

  describe('Unicode and special character handling', () => {
    it('should handle driver names with apostrophes', () => {
      const text = `FOR SERVICE PERFORMED BY

AGENCY/ O'BRIEN, PATRICK

TRIP NUMBER
111

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].driverName).toContain("O'BRIEN");
      expect(result.lines[0].driverLastName).toContain("O'BRIEN");
    });

    it('should handle city names with hyphens', () => {
      const text = `TRIP NUMBER
222

ORIGIN

WILKES-BARRE PA

NET BALANCE 200.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].origin).toContain('WILKES-BARRE');
    });

    it('should handle city names with multiple words', () => {
      const text = `TRIP NUMBER
333

ORIGIN

SAINT LOUIS MO

NET BALANCE 300.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].origin).toContain('SAINT LOUIS');
    });

    it('should handle shipper names with ampersands', () => {
      const text = `TRIP NUMBER
444

357236/ SMITH & SONS COD

NET BALANCE 400.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      if (result.lines[0].shipperName) {
        expect(result.lines[0].shipperName).toContain('SMITH');
      }
    });
  });

  describe('Service items edge cases', () => {
    it('should handle empty service items', () => {
      const text = `TRIP NUMBER
555

REVENUE/
EXPENSE

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].serviceItems).toEqual([]);
    });

    it('should handle service items with negative amounts', () => {
      const text = `TRIP NUMBER
666

REVENUE/
EXPENSE

FUEL SURCHARGE -50.00 100 -50.00

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].serviceItems.length).toBeGreaterThan(0);
      const fuelItem = result.lines[0].serviceItems.find((i) => i.description.includes('FUEL'));
      if (fuelItem) {
        expect(fuelItem.amount).toBe(-50.0);
      }
    });
  });

  describe('Shipper name extraction regression tests', () => {
    it('should extract shipper from SHIPPER NAME section, not BILL OF LADING header (batch 2485338f page 12)', () => {
      const text = `TRIP NUMBER
1854

SHIPPER NAME
BILL OF LADING
NUMBER
SUPL
356985/357175
BELLI

ORIGIN
WESTBOROUG MA

DESTINATION
AKRON OH

11 19 5 P68

NET BALANCE 3890.63
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].shipperName).toBe('BELLI');
      expect(result.lines[0].shipperName).not.toBe('BILL OF LADING');
    });

    it('should handle city names with embedded state codes (batch 2485338f page 13)', () => {
      const text = `TRIP NUMBER
416

ORIGIN
MISSOURI CTX

ZIP 77489

DESTINATION
GERMANTOWN MD

12 125 P62

NET BALANCE 314.83
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines).toHaveLength(1);
      // Should extract "MISSOURI C, TX" or handle "MISSOURI CTX" correctly
      expect(result.lines[0].origin).toBeDefined();
      expect(result.lines[0].origin).toContain('MISSOURI');
    });

    it('should parse date with merged day+year format (batch 2485338f page 13)', () => {
      const text = `TRIP NUMBER
416

ORIGIN
CITY TX

12 125 P62

NET BALANCE 314.83
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines).toHaveLength(1);
      // "12 125" should be parsed as month=12, day=12, year=5 -> 2025-12-12
      expect(result.lines[0].deliveryDate).toBe('2025-12-12');
    });

    it('should parse page 12 date correctly (11 19 5 P68)', () => {
      const text = `TRIP NUMBER
1854

SHIPPER NAME
BELLI

ORIGIN
WESTBOROUGH MA

DESTINATION
AKRON OH

11 19 5 P68

NET BALANCE 3890.63
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines).toHaveLength(1);
      // "11 19 5 P68" should be parsed as month=11, day=19, year=5 -> 2025-11-19
      expect(result.lines[0].deliveryDate).toBe('2025-11-19');
    });

    it('should parse page 13 date correctly (12 125 P62) and NOT as 01/02', () => {
      const text = `TRIP NUMBER
416

ORIGIN
MISSOURI CTX

ZIP 77489

DESTINATION
GERMANTOWN MD

12 125 P62

NET BALANCE 314.83
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines).toHaveLength(1);
      // "12 125" should be parsed as month=12, day=12, year=5 -> 2025-12-12
      // NOT as 2025-01-02 (which would happen if parsed as MM/DD/YY instead)
      expect(result.lines[0].deliveryDate).toBe('2025-12-12');
      expect(result.lines[0].deliveryDate).not.toBe('2025-01-02');
    });
  });

  describe('Weight and miles edge cases', () => {
    it('should handle zero weight', () => {
      const text = `TRIP NUMBER
777

0/ 0 BILLING

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].weight).toBe(0);
    });

    it('should handle large weight values', () => {
      const text = `TRIP NUMBER
888

50000/ 5000 BILLING

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].weight).toBe(50000);
    });

    it('should extract overflow weight when present', () => {
      const text = `TRIP NUMBER
999

10000/2500 12345 BILLING

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(text);
      // Parser extracts the first number as weight
      expect(result.lines[0].weight).toBeDefined();
      expect(result.lines[0].overflowWeight).toBeDefined();
      // Verify at least one weight value was extracted
      expect(result.lines[0].weight || result.lines[0].overflowWeight).toBeTruthy();
    });
  });
});
