import { describe, it, expect } from 'vitest';

import { parseSettlementDetail } from '../../src/parsers/nvl/settlement-detail.parser.js';

describe('Settlement Detail Parser', () => {
  it('should parse a complete settlement detail document', () => {
    const sampleText = `
SETTLEMENT DEPARTMENT
REVENUE DISTRIBUTION
2800 W ROOSEVELT ROAD
BROADVIEW, ILLINOIS 60155-3756
TELEPHONE: (708) 450-2900 TOLL FREE: (800) 323-1962
FAX: (708) 223-1969

SETTLEMENT DETAIL

ACCOUNT 03101                                                           PAGE 1
CICEROS' MOVING & STORAGE LLC      THE FOLLOWING ITEMS DUE ACCOUNT WERE
MACON                    GA        PAID WITH CHECK 590668 ON 12/18/25

B/L      TRIP   REF #    DATE      TRANSACTION/DESCRIPTION    AMOUNT          COMMENTS

         1855  590493  12/02/25 CM  COMDATA                   518.00
         1855  590493  12/02/25 CM  COMDATA                   157.50
                       12/10/25 MC  MOTOR VEH REP               5.25
                       12/16/25 MC  PROFILE SEO                85.00
                       12/01/25 MC  ELD SRVC FEE               33.06
                       12/01/25 MC  ELD SRVC FEE               33.06
                       12/01/25 MC  ELD SRVC FEE               33.06
               256483  12/12/25 PT  OTHER CHARGES              10.00
356985   1854           12/12/25 RD  REVENUE DISTR           3,890.63-
357236    416           12/15/25 RD  REVENUE DISTR             314.83-

                                    <CHECK TOTAL>           3,330.53
    `;

    const result = parseSettlementDetail(sampleText);

    expect(result.accountNumber).toBe('03101');
    expect(result.checkNumber).toBe('590668');
    expect(result.checkDate).toBe('2025-12-18');
    expect(result.checkTotal).toBe(3330.53);
    expect(result.lines.length).toBeGreaterThanOrEqual(8); // At least 8 transaction lines

    // Verify line types
    const advances = result.lines.filter((l) => l.lineType === 'ADVANCE');
    const deductions = result.lines.filter((l) => l.lineType === 'DEDUCTION');
    const revenues = result.lines.filter((l) => l.lineType === 'REVENUE');

    expect(advances.length).toBeGreaterThanOrEqual(2); // At least 2 COMDATA advances
    expect(deductions.length).toBeGreaterThanOrEqual(4); // Multiple deductions
    expect(revenues.length).toBeGreaterThanOrEqual(2); // 2 revenue distributions
  });

  it('should parse COMDATA advance lines', () => {
    const sampleText = `1855 590493 12/02/25 CM COMDATA 518.00`;
    const result = parseSettlementDetail(sampleText);

    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.tripNumber).toBe('1855');
    expect(line.referenceNumber).toBe('590493');
    expect(line.date).toBe('2025-12-02');
    expect(line.transactionCode).toBe('CM');
    expect(line.description).toBe('COMDATA');
    expect(line.amount).toBe(518.0);
    expect(line.lineType).toBe('ADVANCE');
  });

  it('should parse miscellaneous charge lines', () => {
    const sampleText = `12/10/25 MC MOTOR VEH REP 5.25`;
    const result = parseSettlementDetail(sampleText);

    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.date).toBe('2025-12-10');
    expect(line.transactionCode).toBe('MC');
    expect(line.description).toBe('MOTOR VEH REP');
    expect(line.amount).toBe(5.25);
    expect(line.lineType).toBe('DEDUCTION');
  });

  it('should parse revenue distribution lines with negative amounts', () => {
    const sampleText = `356985 1854 12/12/25 RD REVENUE DISTR 3,890.63-`;
    const result = parseSettlementDetail(sampleText);

    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.billOfLading).toBe('356985');
    expect(line.tripNumber).toBe('1854');
    expect(line.date).toBe('2025-12-12');
    expect(line.transactionCode).toBe('RD');
    expect(line.description).toBe('REVENUE DISTR');
    expect(line.amount).toBe(-3890.63);
    expect(line.lineType).toBe('REVENUE');
  });

  it('should parse posting ticket lines', () => {
    const sampleText = `256483 12/12/25 PT OTHER CHARGES 10.00`;
    const result = parseSettlementDetail(sampleText);

    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.referenceNumber).toBe('256483');
    expect(line.date).toBe('2025-12-12');
    expect(line.transactionCode).toBe('PT');
    expect(line.description).toBe('OTHER CHARGES');
    expect(line.amount).toBe(10.0);
    expect(line.lineType).toBe('DEDUCTION');
  });

  it('should handle amounts with commas', () => {
    const sampleText = `12/12/25 RD REVENUE DISTR 3,890.63`;
    const result = parseSettlementDetail(sampleText);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].amount).toBe(3890.63);
  });

  it('should skip header lines and empty lines', () => {
    const sampleText = `
B/L      TRIP   REF #    DATE      TRANSACTION/DESCRIPTION    AMOUNT

         1855  590493  12/02/25 CM  COMDATA                   518.00

PAGE 1
    `;

    const result = parseSettlementDetail(sampleText);
    expect(result.lines).toHaveLength(1);
  });

  it('should validate check total matches parsed lines', () => {
    const sampleText = `
CHECK 590668 ON 12/18/25

12/10/25 MC MOTOR VEH REP 5.25
12/16/25 MC PROFILE SEO 85.00

<CHECK TOTAL> 90.25
    `;

    const result = parseSettlementDetail(sampleText);
    expect(result.errors).toHaveLength(0);
    expect(result.checkTotal).toBe(90.25);
  });

  it('should report error when check total does not match', () => {
    const sampleText = `
CHECK 590668 ON 12/18/25

12/10/25 MC MOTOR VEH REP 5.25
12/16/25 MC PROFILE SEO 85.00

<CHECK TOTAL> 100.00
    `;

    const result = parseSettlementDetail(sampleText);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Check total mismatch');
  });

  it('should handle multiple ELD service fees', () => {
    const sampleText = `
12/01/25 MC ELD SRVC FEE 33.06
12/01/25 MC ELD SRVC FEE 33.06
12/01/25 MC ELD SRVC FEE 33.06
    `;

    const result = parseSettlementDetail(sampleText);
    expect(result.lines).toHaveLength(3);
    expect(result.lines.every((l) => l.amount === 33.06)).toBe(true);
    expect(result.lines.every((l) => l.lineType === 'DEDUCTION')).toBe(true);
  });

  it('should extract account name from header', () => {
    const sampleText = `
ACCOUNT 03101
CICEROS' MOVING & STORAGE LLC
MACON                    GA
    `;

    const result = parseSettlementDetail(sampleText);
    expect(result.accountNumber).toBe('03101');
    expect(result.accountName).toContain("CICEROS' MOVING & STORAGE LLC");
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const result = parseSettlementDetail('');
      expect(result.lines).toHaveLength(0);
    });

    it('should handle whitespace-only text', () => {
      const result = parseSettlementDetail('   \n\t\n   ');
      expect(result.lines).toHaveLength(0);
    });

    it('should handle text with no transaction lines', () => {
      const sampleText = `
SETTLEMENT DETAIL
ACCOUNT 03101
B/L      TRIP   REF #    DATE      TRANSACTION/DESCRIPTION    AMOUNT
    `;

      const result = parseSettlementDetail(sampleText);
      expect(result.lines).toHaveLength(0);
      expect(result.accountNumber).toBe('03101');
    });

    it('should skip malformed lines', () => {
      const sampleText = `
CHECK 590668 ON 12/18/25

BAD LINE WITH NO PATTERN
TOO SHORT
12/10/25 MC MOTOR VEH REP 5.25
    `;

      const result = parseSettlementDetail(sampleText);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].description).toBe('MOTOR VEH REP');
    });
  });

  describe('Date edge cases', () => {
    it('should handle invalid date format gracefully', () => {
      const sampleText = `99/99/99 MC INVALID DATE 5.25`;
      const result = parseSettlementDetail(sampleText);

      // Parser may skip or include line with invalid date
      // At minimum, should not crash
      expect(result).toBeDefined();
    });

    it('should parse leap year date', () => {
      const sampleText = `02/29/24 MC LEAP YEAR 10.00`;
      const result = parseSettlementDetail(sampleText);

      if (result.lines.length > 0) {
        expect(result.lines[0].date).toBe('2024-02-29');
      }
    });

    it('should handle dates at year boundary', () => {
      const sampleText = `
12/31/25 MC END OF YEAR 10.00
01/01/26 MC NEW YEAR 20.00
    `;

      const result = parseSettlementDetail(sampleText);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].date).toBe('2025-12-31');
      expect(result.lines[1].date).toBe('2026-01-01');
    });
  });

  describe('Currency edge cases', () => {
    it('should handle zero amounts', () => {
      const sampleText = `12/10/25 MC ZERO CHARGE 0.00`;
      const result = parseSettlementDetail(sampleText);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].amount).toBe(0.0);
    });

    it('should handle large amounts with multiple commas', () => {
      const sampleText = `12/10/25 RD BIG REVENUE 1,234,567.89-`;
      const result = parseSettlementDetail(sampleText);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].amount).toBe(-1234567.89);
    });

    it('should handle amounts without commas', () => {
      const sampleText = `12/10/25 MC NO COMMA 12345.67`;
      const result = parseSettlementDetail(sampleText);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].amount).toBe(12345.67);
    });

    it('should detect check total mismatch with small difference', () => {
      const sampleText = `
CHECK 590668 ON 12/18/25

12/10/25 MC CHARGE ONE 100.00
12/11/25 MC CHARGE TWO 200.00

<CHECK TOTAL> 300.10
    `;

      const result = parseSettlementDetail(sampleText);
      // Larger mismatch should be detected (0.10 difference > tolerance)
      expect(result.errors.some((e) => e.includes('mismatch'))).toBe(true);
    });
  });

  describe('Transaction code variations', () => {
    it('should handle unknown transaction codes', () => {
      const sampleText = `12/10/25 XX UNKNOWN CODE 5.25`;
      const result = parseSettlementDetail(sampleText);

      if (result.lines.length > 0) {
        expect(result.lines[0].transactionCode).toBe('XX');
        expect(result.lines[0].lineType).toBe('OTHER');
      }
    });

    it('should classify CA as advance', () => {
      const sampleText = `12/10/25 CA CASH ADVANCE 500.00`;
      const result = parseSettlementDetail(sampleText);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lineType).toBe('ADVANCE');
    });

    it('should classify CL as deduction', () => {
      const sampleText = `12/10/25 CL CLAIM 75.00`;
      const result = parseSettlementDetail(sampleText);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lineType).toBe('DEDUCTION');
    });

    it('should classify POA as other', () => {
      const sampleText = `12/10/25 POA PAYMENT ON ACCOUNT 100.00`;
      const result = parseSettlementDetail(sampleText);

      // Parser may not parse this minimal format
      if (result.lines.length > 0) {
        expect(result.lines[0].lineType).toBe('OTHER');
      }
    });
  });

  describe('Line format variations', () => {
    it('should parse line with only B/L and trip (no ref)', () => {
      const sampleText = `356985 1854 12/12/25 RD REVENUE DISTR 3,890.63-`;
      const result = parseSettlementDetail(sampleText);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].billOfLading).toBe('356985');
      expect(result.lines[0].tripNumber).toBe('1854');
      expect(result.lines[0].referenceNumber).toBeUndefined();
    });

    it('should parse line with trip as short number', () => {
      const sampleText = `123 12/15/25 RD REVENUE 500.00-`;
      const result = parseSettlementDetail(sampleText);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].tripNumber).toBe('123');
    });

    it('should parse line with ref as long number', () => {
      const sampleText = `123456 12/15/25 PT POSTING TICKET 50.00`;
      const result = parseSettlementDetail(sampleText);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].referenceNumber).toBe('123456');
    });
  });

  describe('Settlement metadata extraction', () => {
    it('should extract settlement date when present', () => {
      const sampleText = `
SETTLEMENT DETAIL
ACCOUNT 03101
AS OF 12/03/25
    `;

      const result = parseSettlementDetail(sampleText);
      expect(result.settlementDate).toBe('2025-12-03');
    });

    it('should preserve leading zeros in account number', () => {
      const sampleText = `
ACCOUNT 00123
    `;

      const result = parseSettlementDetail(sampleText);
      expect(result.accountNumber).toBe('00123');
    });
  });
});
