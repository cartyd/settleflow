import { describe, it, expect } from 'vitest';
import {
  tryExtractionStrategies,
  createRegexStrategy,
  createBoundedSearchStrategy,
  createLineBasedStrategy,
} from '../../../src/parsers/utils/extraction-patterns.js';

describe('extraction-patterns', () => {
  it('tryExtractionStrategies returns first successful result', () => {
    const res = tryExtractionStrategies('abc 123', [
      () => undefined,
      (t) => (t.includes('123') ? 'ok' : undefined),
      () => 'later',
    ]);
    expect(res).toBe('ok');
  });

  it('createRegexStrategy extracts with transform', () => {
    const strategy = createRegexStrategy(/PT\s*NUMBER\s*(\d+)/i, (m) => m[1]);
    expect(strategy('PT NUMBER 256483')).toBe('256483');
    expect(strategy('no match')).toBeUndefined();
  });

  it('createBoundedSearchStrategy limits search span', () => {
    const text = 'HEADER\nSOME\nLINES\nTARGET: ABC\nFOOTER';
    const strategy = createBoundedSearchStrategy(
      /HEADER/i,
      /TARGET:\s*(\w+)/,
      50,
      (m) => m[1]
    );
    expect(strategy(text)).toBe('ABC');
    expect(strategy('outside bounds')).toBeUndefined();
  });

  it('createLineBasedStrategy scans forward within window', () => {
    const lines = ['TRIP NUMBER', ' ', '123', 'NET BALANCE 10.00'];
    const strategy = createLineBasedStrategy(/TRIP NUMBER/i, 3, (line) => {
      const m = line.match(/^(\d+)$/);
      return m ? m[1] : undefined;
    });
    expect(strategy(lines.join('\n'))).toBe('123');
  });
});
