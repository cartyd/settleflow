import { describe, it, expect } from 'vitest';
import { parseRevenueDistribution } from '../../src/parsers/nvl/revenue-distribution.parser.js';

describe('Revenue Distribution Parser - Locations and Sections', () => {
  describe('Destination extraction with lookahead', () => {
    it('finds state a few lines after city (skipping ZIP/WEIGHT)', () => {
      const text = `TRIP NUMBER\n123\n\nDESTINATION\n\nAKRON\nZIP\n44306\nWEIGHT\n12000\nOH\n\nNET BALANCE 100.00\nDUE ACCOUNT`;
      const result = parseRevenueDistribution(text);
      expect(result.lines[0].destination).toBe('AKRON, OH');
    });

    it('returns undefined when state is beyond lookahead window', () => {
      const filler = Array.from({ length: 12 }, (_, i) => `LINE${i + 1}`).join('\n');
      const text = `TRIP NUMBER\n124\n\nDESTINATION\nCITYVILLE\n${filler}\nTX\n\nNET BALANCE 200.00`;
      const result = parseRevenueDistribution(text);
      expect(result.lines[0].destination).toBeUndefined();
    });
  });

  describe('Origin extraction with lookahead', () => {
    it('captures city then later state within window', () => {
      const text = `TRIP NUMBER\n125\n\nORIGIN\n\nARNOLD\nZIP\n63010\nREFERENCE\nABC123\nMO\n\nNET BALANCE 150.00`;
      const result = parseRevenueDistribution(text);
      expect(result.lines[0].origin).toBe('ARNOLD, MO');
    });
  });

  describe('BOL section span', () => {
    it('extracts B/L even with intervening text within span', () => {
      const between = 'Note: Details for bill of lading follow below.';
      const text = `TRIP NUMBER\n126\n\nBILL OF LADING\n${between}\n\n123456 / 789012\n\nNET BALANCE 175.00`;
      const result = parseRevenueDistribution(text);
      expect(result.lines[0].billOfLading).toBe('123456');
    });
  });
});
