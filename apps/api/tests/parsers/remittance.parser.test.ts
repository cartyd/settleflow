import { describe, it, expect } from 'vitest';
import { parseRemittance } from '../../src/parsers/nvl/remittance.parser.js';

describe('Remittance Parser', () => {
  const sampleRemittance = `NATIONAL VAN LINES INC
2800 ROOSEVELT ROAD, BROADVIEW, ILLINOIS 60155

590668

NON-NEGOTIABLE

PAY TO THE ORDER OF $***3,330 AND 53/100 DOLLARS DATE 12/18/25 AMOUNT $3,330.53

CICEROS MOVING & STORAGE LLC
P. O. BOX 166
MACON GA 31202-0166

NATIONAL VAN LINES INC
AGENCY ACCOUNT

NON-NEGOTIABLE

REMITTANCE ADVISE
ACCOUNT NUMBER AMOUNT
GENERAL LEDGER AGENT DEBIT CREDIT
3101 3,330.53

ACCOUNTING
DISTRIBUTION

DETAIL:
PAYMENT PER ATTACHED
590668

BANK ACCT#590034319

PLEASE BE ADVISED THAT YOUR SETTLEMENT BACKUP
FOR THIS CHECK HAS BEEN EMAILED ON
12/18/25 TO CICEROS@CRMOVER.COM

* THIS AMOUNT WAS ELECTRONICALLY TRANSFERRED TO YOUR ACCOUNT ON
FILE WITH NVL.

NATIONAL VAN LINES INC
BROADVIEW, ILLINOIS 60155`;

  it('should extract check number', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].checkNumber).toBe('590668');
  });

  it('should extract check date', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.lines[0].checkDate).toBe('2025-12-18');
  });

  it('should extract check amount', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.lines[0].checkAmount).toBe(3330.53);
  });

  it('should extract payee name', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.lines[0].payeeName).toBe('CICEROS MOVING & STORAGE LLC');
  });

  it('should extract payee address', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.lines[0].payeeAddress).toContain('P. O. BOX 166');
    expect(result.lines[0].payeeAddress).toContain('31202-0166');
  });

  it('should extract bank account', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.lines[0].bankAccount).toBe('590034319');
  });

  it('should extract payment method', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.lines[0].paymentMethod).toBe('Electronic Transfer');
  });

  it('should extract account number', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.lines[0].accountNumber).toBe('3101');
  });

  it('should use check number as reference', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.lines[0].reference).toBe('590668');
  });

  it('should detect check payment method from NON-NEGOTIABLE', () => {
    const checkRemittance = sampleRemittance.replace('ELECTRONICALLY TRANSFERRED', 'PAID BY CHECK');
    const result = parseRemittance(checkRemittance);
    expect(result.lines[0].paymentMethod).toBe('Check');
  });

  it('should handle missing optional fields gracefully', () => {
    const minimalRemittance = `
CHECK 590668
DATE 12/18/25
AMOUNT $3,330.53
`;
    const result = parseRemittance(minimalRemittance);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].checkNumber).toBe('590668');
    expect(result.lines[0].checkDate).toBe('2025-12-18');
    expect(result.lines[0].checkAmount).toBe(3330.53);
  });

  it('should not have errors for valid document', () => {
    const result = parseRemittance(sampleRemittance);
    expect(result.errors).toHaveLength(0);
  });

  it('should report error when essential fields missing', () => {
    const invalidRemittance = 'RANDOM TEXT WITH NO CHECK INFO';
    const result = parseRemittance(invalidRemittance);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
