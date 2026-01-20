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
    const text = 'ADVANCE REQUEST FOR ADVANCE\nDriver: Jane Smith\nAmount: $500';
    expect(detectDocumentType(text)).toBe(DocumentType.ADVANCE_ADVICE);
  });

  it('should detect advance advice with chargeback', () => {
    const text = 'ADVANCE CHARGEBACK\nDriver: Jane Smith\nAmount: $500';
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

  it('should detect revenue distribution with BILL OF LADING and SHIPPER', () => {
    // This is the specific case from batch bb400412 page 9
    // that was being misclassified as CREDIT_DEBIT
    const text = `FOR SERVICE PERFORMED BY
BILL OF LADING: 354878
SHIPPER NAME: OXNARD
ORIGIN: SHERMAN OA CA 91423
DESTINATION: ACTON MA 1720
TRIP: 1856
DELIVERY DATE: 12/19/2025`;
    expect(detectDocumentType(text)).toBe(DocumentType.REVENUE_DISTRIBUTION);
  });

  it('should detect revenue distribution with ORIGIN, DESTINATION, and SHIPPER', () => {
    const text = `BILL OF LADING: 357207
SHIPPER: SIEGL
ORIGIN: NEW YORK NY
DESTINATION: LOS ANGELES CA
TRIP: 1856
SERVICE ITEMS
Gross Revenue: $5000`;
    expect(detectDocumentType(text)).toBe(DocumentType.REVENUE_DISTRIBUTION);
  });

  it('should not misclassify revenue distribution as credit/debit', () => {
    // Ensure that having generic keywords doesn't override specific revenue markers
    const text = `FOR SERVICE PERFORMED BY
BILL OF LADING: 354878
SHIPPER: OXNARD
ORIGIN: SHERMAN OA CA
DESTINATION: ACTON MA
This may contain the word CREDIT in some context
TRIP: 1856`;
    expect(detectDocumentType(text)).toBe(DocumentType.REVENUE_DISTRIBUTION);
  });

  it('should detect credit/debit with explicit CREDIT OR DEBIT NOTIFICATION', () => {
    // This is the specific case from batch bb400412 page 8
    const text = `CREDIT OR DEBIT NOTIFICATION
THIS IS TO NOTIFY YOU OF CREDIT OR DEBIT ADJUSTMENTS
FUEL SURCHARGE: -$50`;
    expect(detectDocumentType(text)).toBe(DocumentType.CREDIT_DEBIT);
  });
});
