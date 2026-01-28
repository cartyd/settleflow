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
      expect(result.errors.some(e => e.toLowerCase().includes('trip number'))).toBe(true);
    });

    it('should report error when net balance is missing', () => {
      const text = `TRIP NUMBER
777`;
      
      const result = parseRevenueDistribution(text);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.toLowerCase().includes('net balance'))).toBe(true);
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
      expect(result.lines[0].netBalance).toBe(100.00);
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
});
