/**
 * Shared extraction pattern utilities for NVL parsers
 * 
 * Provides reusable pattern matching strategies used across multiple parsers
 */

/**
 * Strategy function type for extraction attempts
 * Returns extracted value or undefined if pattern doesn't match
 */
export type ExtractionStrategy<T> = (text: string) => T | undefined;

/**
 * Apply extraction strategies in order until one succeeds
 * 
 * This implements the "try multiple patterns" approach used throughout parsers.
 * Strategies are tried in order and the first successful match is returned.
 * 
 * @param text - Text to extract from
 * @param strategies - Array of extraction strategy functions to try
 * @returns First successful extraction result, or undefined if all fail
 * 
 * @example
 * const amount = tryExtractionStrategies(text, [
 *   tryGLAmountPattern,
 *   tryTotalChargePattern,
 *   tryAmountHeaderPattern,
 *   trySimpleAmountPattern
 * ]);
 */
export function tryExtractionStrategies<T>(
  text: string,
  strategies: ExtractionStrategy<T>[]
): T | undefined {
  for (const strategy of strategies) {
    const result = strategy(text);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

/**
 * Create a regex-based extraction strategy
 * 
 * Helper to create extraction functions that use regex pattern matching
 * 
 * @param pattern - Regex pattern to match
 * @param extractor - Function to extract value from regex match
 * @returns Extraction strategy function
 * 
 * @example
 * const extractAccountNumber = createRegexStrategy(
 *   /ACCOUNT\s+(\d+)/i,
 *   (match) => match[1]
 * );
 */
export function createRegexStrategy<T>(
  pattern: RegExp,
  extractor: (match: RegExpMatchArray) => T
): ExtractionStrategy<T> {
  return (text: string): T | undefined => {
    const match = text.match(pattern);
    if (match) {
      try {
        return extractor(match);
      } catch {
        return undefined;
      }
    }
    return undefined;
  };
}

/**
 * Create a bounded search extraction strategy
 * 
 * Searches for a pattern within a bounded region after a header
 * Useful for limiting search scope to avoid false matches
 * 
 * @param headerPattern - Pattern to find the starting point
 * @param valuePattern - Pattern to match within bounded region
 * @param maxSpan - Maximum characters to search after header
 * @param extractor - Function to extract value from match
 * @returns Extraction strategy function
 * 
 * @example
 * const extractDebitAmount = createBoundedSearchStrategy(
 *   /DEBIT/i,
 *   /(\d+\.\d{2})/,
 *   200,
 *   (match) => parseFloat(match[1])
 * );
 */
export function createBoundedSearchStrategy<T>(
  headerPattern: RegExp,
  valuePattern: RegExp,
  maxSpan: number,
  extractor: (match: RegExpMatchArray) => T
): ExtractionStrategy<T> {
  return (text: string): T | undefined => {
    const headerMatch = text.search(headerPattern);
    if (headerMatch < 0) return undefined;
    
    const bounded = text.substring(headerMatch, headerMatch + maxSpan);
    const valueMatch = bounded.match(valuePattern);
    
    if (valueMatch) {
      try {
        return extractor(valueMatch);
      } catch {
        return undefined;
      }
    }
    return undefined;
  };
}

/**
 * Create a line-based extraction strategy
 * 
 * Searches for a header line and extracts value from nearby lines
 * 
 * @param headerPattern - Pattern to identify header line
 * @param lookaheadLines - Number of lines to look ahead
 * @param validator - Function to validate and extract from candidate line
 * @returns Extraction strategy function
 * 
 * @example
 * const extractCity = createLineBasedStrategy(
 *   /^ORIGIN$/i,
 *   5,
 *   (line) => CITY_LINE_RE.test(line) ? line.trim() : undefined
 * );
 */
export function createLineBasedStrategy<T>(
  headerPattern: RegExp,
  lookaheadLines: number,
  validator: (line: string, index: number) => T | undefined
): ExtractionStrategy<T> {
  return (text: string): T | undefined => {
    const lines = text.split('\n');
    const headerIdx = lines.findIndex(l => headerPattern.test(l.trim()));
    
    if (headerIdx < 0) return undefined;
    
    for (let i = headerIdx + 1; i < Math.min(headerIdx + lookaheadLines + 1, lines.length); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const result = validator(line, i - headerIdx - 1);
      if (result !== undefined) {
        return result;
      }
    }
    
    return undefined;
  };
}
