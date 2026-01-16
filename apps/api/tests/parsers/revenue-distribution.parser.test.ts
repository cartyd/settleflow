import { describe, it, expect } from 'vitest';
import { parseRevenueDistribution } from '../../src/parsers/nvl/revenue-distribution.parser.js';

describe('Revenue Distribution Parser', () => {
  const trip1854Text = `FOR SERVICE PERFORMED BY

CICEROS' MOVING & ST/ BIDETTI, DONNY


ACCOUNT NUMBER TRIP NUMBER
3101 1854


BILL OF LADING SHIPPER NAME NVL TYPE NVL ENTRY SUPPLIER NAME SUPPLIER ACTUAL CUT PICKUP REFERENCE BILL
NUMBER ENTITY NUMBER DATE DESCRIPTION NUMBER DELIVERY DATE DELIVERY BATE FRT DATE
356985/ 357175/ BELLÍ COD 10 22 5 481

NVL ENTITY SHIPPER NAME
NUMBER
357175

TRN# 348113

ORIGIN DESTINATION SIT DELIVERED DATE CUT DATE

WESTBOROUGH MA

AKRON

OH 11.19        5 P62
ZIP 01581 ZIP 44311

INTERLINE WEIGHT MILES BILLING RATE TARIFF TENDER SECTION

REFERENCE RATE
13880/   1230 NVL100                 3

REVENUE % DUE CHARGES EARNINGS

NET BALANCE 3890.63
DUE ACCOUNT`;

  const trip416Text = `FOR SERVICE PERFORMED BY


CICEROS' MOVING & ST/ HEAVENLY CARE MOVIN

EBERT, WILLIAM


ACCOUNT NUMBER TRIP NUMBER
3101 416


BILL OF LADING SHIPPER NAME NVL TYPE NVL ENTRY SUPPLIER NAME SUPPLIER ACTUAL CUT PICKUP REFERENCE BILL
NUMBER ENTITY NUMBER DATE DESCRIPTION NUMBER DELIVERY DATE DELIVERY BATE FRT DATE
356985/ 357236/ HARRITS COD 2 12 5 516

TRN# 348118

ORIGIN DESTINATION SIT DELIVERED DATE CUT DATE

MISSOURI C TX GERMANTOWN MD 12 12 5 P62
ZIP 77489 ZIP 20874

INTERLINE WEIGHT MILES BILLING RATE TARIFF TENDER SECTION

REFERENCE RATE
2500 1430 NVL100 3

REVENUE % DUE CHARGES EARNINGS

SERVICE PERFORMED

BOOKER 2248.81 15.0 22.49 337.32

BP FUND 2248.81- 1.0

NET BALANCE 314.83

DUE ACCOUNT`;

  describe('Field extraction', () => {
    const testCases = [
      {
        name: 'Trip 1854 - single line driver format',
        text: trip1854Text,
        expected: {
          tripNumber: '1854',
          driverName: 'BIDETTI, DONNY',
          driverFirstName: 'DONNY',
          driverLastName: 'BIDETTI',
          billOfLading: '356985',
          shipperName: 'BELLÍ',
          origin: 'WESTBOROUGH MA',
          destination: 'AKRON, OH',
          deliveryDate: '2025-11-19',
          netBalance: 3890.63,
        },
      },
      {
        name: 'Trip 416 - multi-line driver with combined origin/destination',
        text: trip416Text,
        expected: {
          tripNumber: '416',
          driverName: 'EBERT, WILLIAM',
          driverFirstName: 'WILLIAM',
          driverLastName: 'EBERT',
          billOfLading: '356985',
          shipperName: 'HARRITS',
          origin: 'MISSOURI C TX',
          destination: 'GERMANTOWN, MD',
          deliveryDate: '2025-12-12',
          weight: 2500,
          miles: 1430,
          netBalance: 314.83,
        },
      },
    ];

    testCases.forEach(({ name, text, expected }) => {
      describe(name, () => {
        const result = parseRevenueDistribution(text);
        const line = result.lines[0];

        it('should extract trip number', () => {
          expect(line.tripNumber).toBe(expected.tripNumber);
        });

        it('should extract driver name', () => {
          expect(line.driverName).toBe(expected.driverName);
          if (expected.driverFirstName) {
            expect(line.driverFirstName).toBe(expected.driverFirstName);
          }
          if (expected.driverLastName) {
            expect(line.driverLastName).toBe(expected.driverLastName);
          }
        });

        it('should extract bill of lading', () => {
          expect(line.billOfLading).toBe(expected.billOfLading);
        });

        it('should extract shipper name', () => {
          expect(line.shipperName).toBe(expected.shipperName);
        });

        it('should extract origin', () => {
          expect(line.origin).toBe(expected.origin);
        });

        it('should extract destination', () => {
          expect(line.destination).toBe(expected.destination);
        });

        it('should extract delivery date', () => {
          expect(line.deliveryDate).toBe(expected.deliveryDate);
        });

        if (expected.weight !== undefined) {
          it('should extract weight', () => {
            expect(line.weight).toBe(expected.weight);
          });
        }

        if (expected.miles !== undefined) {
          it('should extract miles', () => {
            expect(line.miles).toBe(expected.miles);
          });
        }

        it('should extract net balance', () => {
          expect(line.netBalance).toBe(expected.netBalance);
        });
      });
    });

    it('Trip 416 driver should not include ACCOUNT NUMBER', () => {
      const result = parseRevenueDistribution(trip416Text);
      expect(result.lines[0].driverName).not.toContain('ACCOUNT');
      expect(result.lines[0].driverName).not.toContain('NUMBER');
    });

    it('Trip 416 should extract service items', () => {
      const result = parseRevenueDistribution(trip416Text);
      expect(result.lines[0].serviceItems).toHaveLength(2);
      expect(result.lines[0].serviceItems[0]).toMatchObject({
        description: 'BOOKER',
        amount: 2248.81,
        percentage: 15.0,
        earnings: 337.32,
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle missing optional fields', () => {
      const minimalText = `ACCOUNT NUMBER TRIP NUMBER
3101 999

NET BALANCE 100.00
DUE ACCOUNT`;

      const result = parseRevenueDistribution(minimalText);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].tripNumber).toBe('999');
      expect(result.lines[0].netBalance).toBe(100.00);
      expect(result.lines[0].driverName).toBeUndefined();
    });

    it('should report error when trip number missing', () => {
      const invalidText = `NET BALANCE 100.00`;
      const result = parseRevenueDistribution(invalidText);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('trip number');
    });

    it('should report error when net balance missing', () => {
      const invalidText = `TRIP NUMBER
1234`;
      const result = parseRevenueDistribution(invalidText);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('net balance');
    });
  });

  describe('Date parsing', () => {
    it('should parse MM DD Y format (space separated)', () => {
      const text = `TRIP NUMBER
1234

ORIGIN DESTINATION

CITY ST DEST MD 12 15 5

NET BALANCE 100.00`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBe('2025-12-15');
    });

    it('should parse MM.DD Y format (dot separated)', () => {
      const text = `TRIP NUMBER
1234

ORIGIN

CITY ST
DEST
OH 11.19        5

NET BALANCE 100.00`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].deliveryDate).toBe('2025-11-19');
    });
  });

  describe('Origin/Destination parsing variations', () => {
    it('should handle ORIGIN DESTINATION header with multiple words', () => {
      const text = `TRIP NUMBER
1234

ORIGIN DESTINATION SIT DELIVERED DATE CUT DATE

CITY ST DEST MD 12 12 5

NET BALANCE 100.00`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].origin).toBe('CITY ST');
      expect(result.lines[0].destination).toBe('DEST, MD');
    });

    it('should handle origin/destination on separate lines', () => {
      const text = `TRIP NUMBER
1234

ORIGIN

WESTBOROUGH MA

AKRON

OH

NET BALANCE 100.00`;

      const result = parseRevenueDistribution(text);
      expect(result.lines[0].origin).toBe('WESTBOROUGH MA');
      expect(result.lines[0].destination).toBe('AKRON, OH');
    });
  });
});
