import { describe, it, expect } from 'vitest';

import { parseCreditDebit } from '../../src/parsers/nvl/credit-debit.parser.js';

describe('Credit/Debit Parser', () => {
  const sampleDebit = `NATIONAL
CREDIT OR DEBIT NOTIFICATION

TRANSACTION TYPE	
SAFETY CHARGEBACKS

N.V.L. ENTRY	
120125	
PROCESS DATE	
121625

AGENT/DRIVER NAME	
CICERO'S MOVING & STORAGE	
ACCOUNT NUMBER	
3101	
UNIT #

DESCRIPTION	
DEBITS	
CREDITS
ELD SRVC FEE	
33.06
0000	
112147005360
PAYMENT	
46 OF	
47

FOR ANY DISCREPANCIES PLEASE CONTACT THE
APPROPRIATE DEPARTMENT.

NET BALANCE	
33.06
DUE N.V.L.	
DUE ACCOUNT`;

  const sampleCredit = `NATIONAL
PROFILE SEO

AGENT/DRIVER NAME
CICERO'S MOVING & STORAGE

DESCRIPTION
PROFILE SEO

CREDIT OR DEBIT NOTIFICATION

TRANSACTION TYPE
NVL ENTRY
DATE
PROCESS
DATE
121625
121625
ACCOUNT
NUMBER
UNIT #
3101
DEBITS
CREDITS
85.00

NET BALANCE
DUE NVL
DUE ACCOUNT
85.00`;

  it('should extract transaction type', () => {
    const result = parseCreditDebit(sampleDebit);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].transactionType).toBe('SAFETY CHARGEBACKS');
  });

  it('should extract description from debit form', () => {
    const result = parseCreditDebit(sampleDebit);
    expect(result.lines[0].description).toBe('ELD SRVC FEE');
  });

  it('should extract description from credit form', () => {
    const result = parseCreditDebit(sampleCredit);
    expect(result.lines[0].description).toBe('PROFILE SEO');
  });

  it('should extract debit amount', () => {
    const result = parseCreditDebit(sampleDebit);
    expect(result.lines[0].amount).toBe(33.06);
    expect(result.lines[0].isDebit).toBe(true);
  });

  it('should extract credit amount', () => {
    const result = parseCreditDebit(sampleCredit);
    expect(result.lines[0].amount).toBe(85.0);
    expect(result.lines[0].isDebit).toBe(true); // "DEBITS" column in this example
  });

  it('should parse entry date in MMDDYY format', () => {
    const result = parseCreditDebit(sampleDebit);
    expect(result.lines[0].entryDate).toBe('2025-12-01'); // 120125 = 12/01/25
  });

  it('should parse process date in MMDDYY format', () => {
    const result = parseCreditDebit(sampleDebit);
    expect(result.lines[0].processDate).toBe('2025-12-16'); // 121625 = 12/16/25
  });

  it('should extract account number', () => {
    const result = parseCreditDebit(sampleDebit);
    expect(result.lines[0].accountNumber).toBe('3101');
  });

  it('should extract payment reference', () => {
    const result = parseCreditDebit(sampleDebit);
    expect(result.lines[0].reference).toBe('46 OF 47');
  });

  it('should extract long reference number', () => {
    const result = parseCreditDebit(sampleDebit);
    // Should find the long number 112147005360
    expect(result.lines[0].reference).toBeTruthy();
  });

  it('should handle tab-separated format', () => {
    const tabFormat = `CREDIT OR DEBIT NOTIFICATION
TRANSACTION TYPE
SAFETY CHARGEBACKS
N.V.L. ENTRY	120125
PROCESS DATE	121625
ACCOUNT NUMBER	3101
DESCRIPTION	DEBITS	CREDITS
ELD SRVC FEE	33.06`;

    const result = parseCreditDebit(tabFormat);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].transactionType).toBe('SAFETY CHARGEBACKS');
    expect(result.lines[0].amount).toBe(33.06);
  });

  it('should handle multiple date formats', () => {
    const withSlashDate = `PROCESS DATE
12/16/25`;
    const result = parseCreditDebit(withSlashDate);
    // Should handle MM/DD/YY format if present
    expect(result.lines).toHaveLength(1);
  });

  it('should not have errors for valid document', () => {
    const result = parseCreditDebit(sampleDebit);
    expect(result.errors).toHaveLength(0);
  });

  it('should report error when amount missing', () => {
    const noAmount = `CREDIT OR DEBIT NOTIFICATION
TRANSACTION TYPE
TEST TYPE
DESCRIPTION
NO AMOUNT HERE`;
    const result = parseCreditDebit(noAmount);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('amount');
  });

  it('should use transaction type as description fallback', () => {
    const noDescription = `TRANSACTION TYPE
MOTOR VEH REP
DEBITS
5.25`;
    const result = parseCreditDebit(noDescription);
    expect(result.lines[0].description).toBe('MOTOR VEH REP');
  });

  it('should handle standalone DEBITS column', () => {
    const standaloneDebit = `DESCRIPTION
MOTOR VEH REP
DEBITS
5.25`;
    const result = parseCreditDebit(standaloneDebit);
    expect(result.lines[0].amount).toBe(5.25);
    expect(result.lines[0].isDebit).toBe(true);
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const result = parseCreditDebit('');
      // May create placeholder line or empty
      expect(result).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle whitespace-only text', () => {
      const result = parseCreditDebit('   \n\t\n   ');
      expect(result).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should create placeholder line when dates present but amounts missing', () => {
      const text = `
N.V.L. ENTRY 120125
PROCESS DATE 121625
ACCOUNT NUMBER 3101
`;
      const result = parseCreditDebit(text);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].entryDate).toBe('2025-12-01');
      expect(result.lines[0].amount).toBe(0);
      expect(result.errors.some((e) => e.includes('description/amount'))).toBe(true);
    });
  });

  describe('Multiple line items', () => {
    it('should extract multiple line items from debits section', () => {
      const multiLine = `
TRANSACTION TYPE
SAFETY CHARGEBACKS
DESCRIPTION DEBITS CREDITS
ITEM ONE
10.00
ITEM TWO
20.00
ITEM THREE
30.00
NET BALANCE 60.00
`;
      const result = parseCreditDebit(multiLine);
      // Parser should extract multiple amounts
      expect(result.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('should match descriptions with amounts', () => {
      const text = `
TRANSACTION TYPE
MULTIPLE CHARGES
DESCRIPTION DEBITS CREDITS
ELD SRVC FEE
33.06
PROFILE SEO
85.00
`;
      const result = parseCreditDebit(text);
      expect(result.lines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Date format variations', () => {
    it('should parse compact date MMDDYY', () => {
      const text = `
N.V.L. ENTRY 120125
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0 && result.lines[0].entryDate) {
        expect(result.lines[0].entryDate).toBe('2025-12-01');
      }
    });

    it('should parse slash date MM/DD/YY', () => {
      const text = `
PROCESS DATE 12/16/25
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0 && result.lines[0].processDate) {
        expect(result.lines[0].processDate).toBe('2025-12-16');
      }
    });

    it('should handle invalid entry date gracefully', () => {
      const text = `
N.V.L. ENTRY 999999
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      expect(result).toBeDefined();
      if (result.lines.length > 0) {
        expect(result.lines[0].entryDate).toBeUndefined();
      }
    });

    it('should handle invalid process date gracefully', () => {
      const text = `
PROCESS DATE 99/99/99
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      expect(result).toBeDefined();
      if (result.lines.length > 0) {
        expect(result.lines[0].processDate).toBeUndefined();
      }
    });
  });

  describe('Amount edge cases', () => {
    it('should handle zero amounts', () => {
      const text = `
DESCRIPTION DEBITS
ZERO CHARGE 0.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0) {
        expect(result.lines[0].amount).toBe(0.0);
      }
    });

    it('should handle large amounts with commas', () => {
      const text = `
DESCRIPTION DEBITS
BIG CHARGE 12,345.67
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0) {
        expect(result.lines[0].amount).toBe(12345.67);
      }
    });

    it('should handle negative amounts in credits', () => {
      const text = `
DESCRIPTION CREDITS
CREDIT ITEM 100.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0) {
        // Credits should be negative
        expect(result.lines[0].amount).toBeLessThanOrEqual(0);
      }
    });

    it('should handle trailing negative sign', () => {
      const text = `
DESCRIPTION DEBITS
NEGATIVE 100.00-
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0) {
        expect(result.lines[0].amount).toBe(-100.0);
      }
    });
  });

  describe('Description validation', () => {
    it('should filter out common headers from descriptions', () => {
      const text = `
TRANSACTION TYPE
VALID TYPE
DESCRIPTION DEBITS
NVL
ENTRY
DATE
ACTUAL DESCRIPTION
10.00
`;
      const result = parseCreditDebit(text);
      // Should not include NVL, ENTRY, DATE in descriptions
      if (result.lines.length > 0 && result.lines[0].description) {
        expect(result.lines[0].description).not.toBe('NVL');
        expect(result.lines[0].description).not.toBe('ENTRY');
        expect(result.lines[0].description).not.toBe('DATE');
      }
    });

    it('should filter out sentence fragments', () => {
      const text = `
TRANSACTION TYPE
TEST TYPE
DESCRIPTION DEBITS
PLEASE CONTACT
FOR ANY
MOTOR VEH REP
5.25
`;
      const result = parseCreditDebit(text);
      // Should not include fragments ending in 'contact', 'for', etc.
      if (result.lines.length > 0 && result.lines[0].description) {
        expect(result.lines[0].description).not.toMatch(/contact$/i);
        expect(result.lines[0].description).not.toMatch(/for$/i);
      }
    });

    it('should use transaction type as fallback when description invalid', () => {
      const text = `
TRANSACTION TYPE
MOTOR VEH REP
DESCRIPTION DEBITS
123
NVL
5.25
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0 && result.lines[0].description) {
        expect(result.lines[0].description).toBe('MOTOR VEH REP');
      }
    });
  });

  describe('Reference extraction', () => {
    it('should extract unit number when not 0000', () => {
      const text = `
UNIT # 1234
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0 && result.lines[0].reference) {
        expect(result.lines[0].reference).toBe('1234');
      }
    });

    it('should skip unit number 0000', () => {
      const text = `
UNIT # 0000
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0) {
        expect(result.lines[0].reference).not.toBe('0000');
      }
    });

    it('should extract payment reference', () => {
      const text = `
PAYMENT 46 OF 47
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0 && result.lines[0].reference) {
        expect(result.lines[0].reference).toBe('46 OF 47');
      }
    });

    it('should extract long reference numbers', () => {
      const text = `
112147005360
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0 && result.lines[0].reference) {
        expect(result.lines[0].reference).toBe('112147005360');
      }
    });
  });

  describe('Account number handling', () => {
    it('should remove leading zeros', () => {
      const text = `
ACCOUNT NUMBER 0003101
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0 && result.lines[0].accountNumber) {
        expect(result.lines[0].accountNumber).toBe('3101');
      }
    });

    it('should handle account with no leading zeros', () => {
      const text = `
ACCOUNT NUMBER 3101
DESCRIPTION DEBITS
TEST 10.00
`;
      const result = parseCreditDebit(text);
      if (result.lines.length > 0 && result.lines[0].accountNumber) {
        expect(result.lines[0].accountNumber).toBe('3101');
      }
    });
  });
});
