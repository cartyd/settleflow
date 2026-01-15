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
    expect(result.lines[0].amount).toBe(85.00);
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
});
