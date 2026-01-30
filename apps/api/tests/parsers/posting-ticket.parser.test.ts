import { describe, it, expect } from 'vitest';

import { parsePostingTicket } from '../../src/parsers/nvl/posting-ticket.parser.js';

describe('Posting Ticket Parser', () => {
  it('parses debit amount and header fields via TOTAL section', () => {
    const text = `
12/10/25
PT NUMBER
256483
ACCOUNT
NUMBER
3101
DEBIT
CICEROS' MOVING & ST	3101
TOTAL:
OTHER CHARGES
PT 1 OF 1
10.00
`;
    const result = parsePostingTicket(text);
    expect(result.errors).toHaveLength(0);
    expect(result.lines).toHaveLength(1);

    const line = result.lines[0];
    expect(line.ptNumber).toBe('256483');
    expect(line.accountNumber).toBe('3101');
    expect(line.isCredit).toBe(false);
    expect(line.amount).toBe(-10.0);
    expect(line.description).toContain('OTHER CHARGES');
    expect(line.date).toBe('2025-12-10');
  });

  it('supports comma-separated and negative amounts', () => {
    const text = `
01/15/26
PT NUMBER 999999
ACCOUNT NUMBER 3101
DEBIT
TOTAL:
OTHER CHARGES
PT 1 OF 1
1,234.56
`;
    const result = parsePostingTicket(text);
    expect(result.lines[0].isCredit).toBe(false);
    expect(result.lines[0].amount).toBe(-1234.56);
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const result = parsePostingTicket('');
      expect(result.lines).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle whitespace-only text', () => {
      const result = parsePostingTicket('   \n\t\n   ');
      expect(result.lines).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should error when total amount is missing', () => {
      const text = `
PT NUMBER 256483
ACCOUNT NUMBER 3101
DEBIT
OTHER CHARGES
`;
      const result = parsePostingTicket(text);
      expect(result.errors.some((e) => e.toLowerCase().includes('total amount'))).toBe(true);
    });

    it('should handle missing PT number', () => {
      const text = `
    12/10/25
    ACCOUNT NUMBER 3101
    DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    10.00
    `;
      const result = parsePostingTicket(text);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].ptNumber).toBeUndefined();
      expect(result.lines[0].amount).toBe(-10.0);
    });

    it('should handle missing account number', () => {
      const text = `
    12/10/25
    PT NUMBER 256483
    DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    10.00
    `;
      const result = parsePostingTicket(text);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].accountNumber).toBeUndefined();
      expect(result.lines[0].amount).toBe(-10.0);
    });
  });

  describe('Date edge cases', () => {
    it('should parse date without leading zeros', () => {
      const text = `
1/5/26
PT NUMBER 256483
DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    10.00
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].date).toBe('2026-01-05');
    });

    it('should handle missing date', () => {
      const text = `
    PT NUMBER 256483
    ACCOUNT NUMBER 3101
    DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    10.00
    `;
      const result = parsePostingTicket(text);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].date).toBeUndefined();
    });

    it('should handle invalid date gracefully', () => {
      const text = `
99/99/99
PT NUMBER 256483
DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    10.00
`;
      const result = parsePostingTicket(text);
      expect(result).toBeDefined();
    });
  });

  describe('Amount edge cases', () => {
    it('should handle zero debit amount', () => {
      const text = `
12/10/25
PT NUMBER 256483
DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    0.00
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].amount).toBe(-0.0);
    });

    it('should handle large amounts with multiple commas', () => {
      const text = `
12/10/25
PT NUMBER 256483
DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    1,234,567.89
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].amount).toBe(-1234567.89);
    });

    it('should handle amounts without commas', () => {
      const text = `
12/10/25
PT NUMBER 256483
DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    12345.67
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].amount).toBe(-12345.67);
    });

    it('should preserve negative sign', () => {
      const text = `
12/10/25
PT NUMBER 256483
DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    100.00
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].amount).toBe(-100.0);
    });
  });

  describe('Account number edge cases', () => {
    it('should remove leading zeros from account', () => {
      const text = `
12/10/25
PT NUMBER 256483
ACCOUNT
NUMBER
0003101
DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    10.00
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].accountNumber).toBe('3101');
    });

    it('should handle account number on same line', () => {
      const text = `
12/10/25
PT NUMBER 256483
ACCOUNT NUMBER 3101
DEBIT
    TOTAL:
    OTHER CHARGES
    PT 1 OF 1
    10.00
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].accountNumber).toBe('3101');
    });
  });

  describe('Description edge cases', () => {
    it('uses the first line after TOTAL when no description line', () => {
      const text = `
12/10/25
PT NUMBER 256483
DEBIT
  TOTAL:
  PT 1 OF 1
  10.00
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].description).toContain('PT 1 OF 1');
    });

    it('should extract OTHER CHARGES when present', () => {
      const text = `
12/10/25
PT NUMBER 256483
DEBIT
OTHER CHARGES
TOTAL:
OTHER CHARGES
PT 1 OF 1
10.00
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].description).toBe('OTHER CHARGES');
    });
  });
  
  describe('Credit vs Debit detection', () => {
    it.skip('sets isCredit=true when amount appears under CREDIT column', () => {
      const text = `
12/18/25
PT NUMBER 777777
ACCOUNT NUMBER 3101
CREDIT
253.17
TOTAL:
TOLLS REIMBURSEMENT FOR TRIP 1854
PT 1 OF 1
253.17
`;
      const result = parsePostingTicket(text);
      expect(result.lines[0].isCredit).toBe(true);
      expect(result.lines[0].amount).toBe(253.17);
      expect(result.lines[0].description).toContain('TOLLS');
    });
  });
});
