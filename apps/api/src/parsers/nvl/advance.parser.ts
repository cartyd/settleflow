/**
 * Regex-based parser for ADVANCE_ADVICE document type
 *
 * Advance documents show cash advances given to drivers (COMDATA, etc.)
 * Enhanced with flexible patterns to handle multiple OCR providers (Ollama, Gemini)
 */

import { normalizeOcrText, OCR_PATTERNS, detectOcrProvider } from '../../utils/ocr-normalizer.js';
import { ADVANCE_TOTAL_CHARGE_SCAN_SPAN } from '../constants.js';
import { parseCompactDate } from '../utils/date-parser.js';
import {
  removeLeadingZeros,
  CURRENCY_AMOUNT_PATTERN,
  parseCurrency,
  CURRENCY_AMOUNT_GLOBAL_RE,
} from '../utils/string-utils.js';

export interface AdvanceLine {
  tripNumber?: string;
  accountNumber?: string;
  driverName?: string;
  advanceAmount: number;
  description?: string;
  date?: string;
  rawText: string;
}

export interface AdvanceParseResult {
  lines: AdvanceLine[];
  errors: string[];
}

/**
 * Extract trip number from normalized text
 */
function extractTripNumber(normalizedText: string): string | undefined {
  const tripMatch = normalizedText.match(OCR_PATTERNS.TRIP);
  return tripMatch?.[1];
}

/**
 * Extract account number from normalized text (removes leading zeros)
 */
function extractAccountNumber(normalizedText: string): string | undefined {
  const accountMatch = normalizedText.match(OCR_PATTERNS.ACCOUNT);
  return accountMatch ? removeLeadingZeros(accountMatch[1]) : undefined;
}

/**
 * Extract driver name from normalized text
 * Normalizes whitespace in extracted name
 */
function extractDriverName(normalizedText: string): string | undefined {
  const driverMatch = normalizedText.match(OCR_PATTERNS.DRIVER);
  // Normalize whitespace: trim and collapse multiple spaces to single space
  return driverMatch ? driverMatch[1].trim().replace(/\s+/g, ' ') : undefined;
}

/**
 * Extract date from normalized text
 */
function extractDate(normalizedText: string): string | undefined {
  const dateMatch = normalizedText.match(/DATE[-\s]*>?\s*\n?\s*(\d{6})/i);
  return parseCompactDate(dateMatch?.[1]);
}

/**
 * Extract description from raw OCR text
 * Uses raw text to preserve original OCR output for matching
 */
function extractDescription(ocrText: string): string {
  const upperText = ocrText.toUpperCase();
  if (upperText.includes('CASH ADVANCE')) {
    return 'CASH ADVANCE';
  }
  return 'COMDATA';
}

/**
 * Try extracting amount from G/L # AMOUNT table pattern
 */
function tryGLAmountPattern(normalizedText: string): number | undefined {
  const pattern = new RegExp(
    `G/L\\s*#[^\\n]*AMOUNT[^\\n]*\\n[^\\n]*?(${CURRENCY_AMOUNT_PATTERN})`,
    'i'
  );
  const match = normalizedText.match(pattern);
  return match ? parseCurrency(match[1]) : undefined;
}

/**
 * Try extracting amount from TOTAL CHARGE header pattern
 */
function tryTotalChargePattern(normalizedText: string): number | undefined {
  const headerIdx = normalizedText.search(/TOTAL[\s\n]+CHARGE/i);
  if (headerIdx < 0) return undefined;
  // Bound search to limited span after header to avoid drift
  const bounded = normalizedText.substring(headerIdx, headerIdx + ADVANCE_TOTAL_CHARGE_SCAN_SPAN);
  const lines = bounded.split('\n');

  // Inspect a few lines after header; select right-most amount token if present
  for (let k = 1; k < Math.min(lines.length, 5); k++) {
    const line = lines[k];
    const matches = Array.from(line.matchAll(CURRENCY_AMOUNT_GLOBAL_RE));
    if (matches.length > 0) {
      const rightMost = matches[matches.length - 1][0];
      return parseCurrency(rightMost);
    }
  }

  return undefined;
}

/**
 * Try extracting amount from AMOUNT header with newline pattern
 */
function tryAmountHeaderPattern(normalizedText: string): number | undefined {
  const pattern = new RegExp(`AMOUNT[^\\n]*\\n[^\\d]*(${CURRENCY_AMOUNT_PATTERN})`, 'i');
  const match = normalizedText.match(pattern);
  return match ? parseCurrency(match[1]) : undefined;
}

/**
 * Try extracting amount from simple AMOUNT pattern
 */
function trySimpleAmountPattern(normalizedText: string): number | undefined {
  const pattern = new RegExp(`AMOUNT\\s+(${CURRENCY_AMOUNT_PATTERN})`, 'i');
  const match = normalizedText.match(pattern);
  return match ? parseCurrency(match[1]) : undefined;
}

/**
 * Extract advance amount using multiple strategies
 */
function extractAdvanceAmount(normalizedText: string): number | undefined {
  return (
    tryGLAmountPattern(normalizedText) ||
    tryTotalChargePattern(normalizedText) ||
    tryAmountHeaderPattern(normalizedText) ||
    trySimpleAmountPattern(normalizedText)
  );
}

/**
 * Parse ADVANCE_ADVICE document using regex patterns
 * Handles both Ollama and Gemini OCR output formats
 */
export function parseAdvance(ocrText: string): AdvanceParseResult {
  const errors: string[] = [];
  const lines: AdvanceLine[] = [];

  try {
    // Normalize text to handle format variations between OCR providers
    // Default to Gemini if provider cannot be detected from text patterns
    const provider = detectOcrProvider(ocrText) ?? 'gemini';
    const normalizedText = normalizeOcrText(ocrText, provider);

    const tripNumber = extractTripNumber(normalizedText);
    const accountNumber = extractAccountNumber(normalizedText);
    const driverName = extractDriverName(normalizedText);
    const date = extractDate(normalizedText);
    const description = extractDescription(ocrText);
    const advanceAmount = extractAdvanceAmount(normalizedText) ?? 0;

    if (advanceAmount === 0) {
      errors.push('Could not extract advance amount from document');
    }

    lines.push({
      tripNumber,
      accountNumber,
      driverName,
      advanceAmount,
      description,
      date,
      rawText: ocrText,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Error parsing advance: ${errorMessage}`);
  }

  return { lines, errors };
}
