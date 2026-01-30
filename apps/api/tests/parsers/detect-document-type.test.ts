import { describe, it, expect } from 'vitest';
import { detectDocumentType } from '../../src/parsers/nvl/detectDocumentType.js';
import { DocumentType } from '@settleflow/shared-types';

describe('detectDocumentType', () => {
  it('detects Remittance', () => {
    const text = 'Payment Advice\nREMITTANCE ADVISE\nACCOUNT NUMBER 3101';
    expect(detectDocumentType(text)).toBe(DocumentType.REMITTANCE);
  });

  it('prioritizes Settlement Detail over Revenue Distribution', () => {
    const text = 'SETTLEMENT DETAIL\nB/L   TRIP   REF #\nREVENUE DISTR';
    expect(detectDocumentType(text)).toBe(DocumentType.SETTLEMENT_DETAIL);
  });

  it('detects Revenue Distribution by markers and skips summary pages', () => {
    const summary = 'REVENUE DISTRIBUTION\nSUMMARY OF ITEMS INCLUDED IN THIS SETTLEMENT';
    expect(detectDocumentType(summary)).toBe(DocumentType.UNKNOWN);

    const detail = 'FOR SERVICE PERFORMED BY\nBILL OF LADING\nSHIPPER NAME\nORIGIN\nDESTINATION';
    expect(detectDocumentType(detail)).toBe(DocumentType.REVENUE_DISTRIBUTION);
  });

  it('detects Posting Ticket', () => {
    expect(detectDocumentType('PT NUMBER\n256483')).toBe(DocumentType.POSTING_TICKET);
    expect(detectDocumentType('POSTING TICKET')).toBe(DocumentType.POSTING_TICKET);
  });

  it('detects Advance Advice', () => {
    const text = 'REQUEST FOR ADVANCE\nADVANCE\nSAFETY CHARGEBACK';
    expect(detectDocumentType(text)).toBe(DocumentType.ADVANCE_ADVICE);
  });

  it('detects Credit/Debit', () => {
    expect(detectDocumentType('CREDIT OR DEBIT NOTIFICATION')).toBe(DocumentType.CREDIT_DEBIT);
    expect(detectDocumentType('ADJUSTMENT NOTICE')).toBe(DocumentType.CREDIT_DEBIT);
  });

  it('returns UNKNOWN when no markers match', () => {
    expect(detectDocumentType('Random unstructured content')).toBe(DocumentType.UNKNOWN);
  });
});
