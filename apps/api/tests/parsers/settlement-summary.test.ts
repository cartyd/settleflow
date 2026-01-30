import { describe, it, expect } from 'vitest';

import { parseSettlementDetail } from '../../src/parsers/nvl/settlement-detail.parser.js';

describe('Settlement Summary - Posting Tickets Extraction', () => {
  describe('Same-line format', () => {
    it('should extract posting ticket from same-line format with debit', () => {
      const sampleText = `
SETTLEMENT SUMMARY
SUMMARY OF ITEMS INCLUDED IN THIS SETTLEMENT
DESCRIPTION    CHARGES    EARNINGS    OPEN
POSTING TICKETS    10.00    .00    10.00
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(10.0);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(false);
    });

    it('should extract posting ticket from same-line format with credit', () => {
      const sampleText = `
SETTLEMENT SUMMARY
SUMMARY OF ITEMS INCLUDED IN THIS SETTLEMENT
DESCRIPTION    CHARGES    EARNINGS    OPEN
POSTING TICKETS    .00    253.17-    253.17-
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(253.17);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(true);
    });
  });

  describe('Multi-line format', () => {
    it('should extract posting ticket from multi-line format with debit', () => {
      const sampleText = `
SETTLEMENT SUMMARY
DESCRIPTION
CHARGES
EARNINGS
OPEN
POSTING TICKETS
10.00
.00
10.00
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(10.0);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(false);
    });

    it('should extract posting ticket from multi-line format with credit', () => {
      const sampleText = `
SETTLEMENT SUMMARY
DESCRIPTION
CHARGES
EARNINGS
OPEN
POSTING TICKETS
.00
253.17-
253.17-
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(253.17);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(true);
    });
  });

  describe('Columnar format', () => {
    it('should extract posting ticket from columnar format with debit', () => {
      const sampleText = `
SETTLEMENT SUMMARY
SUMMARY OF ITEMS INCLUDED IN THIS SETTLEMENT
DESCRIPTION
CHARGES
EARNINGS
OPEN
REVENUE DISTRIBUTION
COMDATA
CASH DISBURSEMENTS
CLAIMS
LEASE PAYMENTS
POSTING TICKETS
TRAILER RENT
REPAIRS
SUPPLIES
OTHER
.00
675.50
.00
.00
.00
10.00
.00
.00
.00
189.43
4,205.46-
.00
.00
.00
.00
.00
.00
.00
.00
.00
4,205.46-
675.50
.00
.00
.00
10.00
.00
.00
.00
189.43
TOTAL
874.93
4,205.46-
3,330.53-
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(10.0);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(false);
    });

    it('should extract posting ticket from columnar format with credit', () => {
      const sampleText = `
SETTLEMENT SUMMARY
DESCRIPTION
CHARGES
EARNINGS
OPEN
REVENUE DISTRIBUTION
COMDATA
POSTING TICKETS
OTHER
.00
500.00
.00
100.00
3,000.00-
.00
253.17-
50.00
3,000.00-
500.00
253.17-
150.00
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(253.17);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(true);
    });

    it('should handle posting tickets at different positions in columnar format', () => {
      // POSTING TICKETS is the first item after DESCRIPTION
      const sampleText = `
SETTLEMENT SUMMARY
DESCRIPTION
CHARGES
EARNINGS
OPEN
POSTING TICKETS
OTHER
25.00
100.00
.00
50.00
25.00
150.00
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(25.0);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should return undefined when SETTLEMENT SUMMARY not found', () => {
      const sampleText = `
SOME OTHER TEXT
POSTING TICKETS    10.00    .00    10.00
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeUndefined();
    });

    it('should return undefined when POSTING TICKETS not found', () => {
      const sampleText = `
SETTLEMENT SUMMARY
DESCRIPTION    CHARGES    EARNINGS    OPEN
REVENUE DISTRIBUTION    .00    4,205.46-    4,205.46-
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeUndefined();
    });

    it('should handle zero amounts in posting tickets', () => {
      const sampleText = `
SETTLEMENT SUMMARY
POSTING TICKETS    .00    .00    .00
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(0.0);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(false);
    });

    it('should handle amounts with commas', () => {
      const sampleText = `
SETTLEMENT SUMMARY
POSTING TICKETS    1,250.50    .00    1,250.50
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(1250.5);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(false);
    });

    it('should handle large amounts', () => {
      const sampleText = `
SETTLEMENT SUMMARY
POSTING TICKETS
10,523.75
.00
10,523.75
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(10523.75);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(false);
    });
  });

  describe('Real-world examples', () => {
    it('should parse batch 1f427cea (multi-line format)', () => {
      const sampleText = `
SETTLEMENT SUMMARY
SUMMARY OF ITEMS INCLUDED IN THIS SETTLEMENT
DESCRIPTION
CHARGES
EARNINGS
OPEN
REVENUE DISTRIBUTION
COMDATA
CASH DISBURSEMENTS
CLAIMS
LEASE PAYMENTS
POSTING TICKETS
TRAILER RENT
REPAIRS
.00
.00
.00
.00
.00
10.00
.00
.00
,205.46-
675.50
.00
.00
.00
.00
.00
.00
4,205.46-
675.50
.00
.00
.00
10.00
.00
.00
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(10.0);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(false);
    });

    it('should parse batch cde782ba (multi-line format with credit)', () => {
      const sampleText = `
SETTLEMENT SUMMARY
POSTING TICKETS
.00
253.17-
253.17-
      `;

      const result = parseSettlementDetail(sampleText);

      expect(result.summaryAmounts).toBeDefined();
      expect(result.summaryAmounts?.postingTickets).toBe(253.17);
      expect(result.summaryAmounts?.isPostingTicketCredit).toBe(true);
    });
  });
});
