import { describe, it, expect } from 'vitest';
import { detectDocumentType } from '../../src/parsers/nvl/detectDocumentType';
import { DocumentType } from '@settleflow/shared-types';

describe('Document Type Detection', () => {
  it('should detect remittance document', () => {
    const text = 'REMITTANCE ADVICE\nPayment Details\nAmount: $1000';
    expect(detectDocumentType(text)).toBe(DocumentType.REMITTANCE);
  });

  it('should detect settlement detail document', () => {
    const text = 'SETTLEMENT DETAIL\nDriver: John Doe\nTrips: 25';
    expect(detectDocumentType(text)).toBe(DocumentType.SETTLEMENT_DETAIL);
  });

  it('should detect revenue distribution document', () => {
    const text = 'REVENUE DISTRIBUTION\nGross: $5000\nCommission: 15%';
    expect(detectDocumentType(text)).toBe(DocumentType.REVENUE_DISTRIBUTION);
  });

  it('should detect advance advice document', () => {
    const text = 'CASH ADVANCE NOTICE\nDriver: Jane Smith\nAmount: $500';
    expect(detectDocumentType(text)).toBe(DocumentType.ADVANCE_ADVICE);
  });

  it('should detect credit/debit document', () => {
    const text = 'CREDIT MEMO\nAdjustment for fuel';
    expect(detectDocumentType(text)).toBe(DocumentType.CREDIT_DEBIT);
  });

  it('should return unknown for unrecognized document', () => {
    const text = 'Some random text without keywords';
    expect(detectDocumentType(text)).toBe(DocumentType.UNKNOWN);
  });

  it('should be case insensitive', () => {
    const text = 'remittance advice in lowercase';
    expect(detectDocumentType(text)).toBe(DocumentType.REMITTANCE);
  });
});
