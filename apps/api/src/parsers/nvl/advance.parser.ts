/**
 * Regex-based parser for ADVANCE_ADVICE document type
 * 
 * Advance documents show cash advances given to drivers (COMDATA, etc.)
 * Enhanced with flexible patterns to handle multiple OCR providers (Ollama, Gemini)
 */

import { normalizeOcrText, OCR_PATTERNS, detectOcrProvider } from '../../utils/ocr-normalizer.js';
import { parseCompactDate } from '../utils/date-parser.js';
import { removeLeadingZeros } from '../utils/string-utils.js';

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

// Regex pattern for currency amounts (e.g., "1,234.56" or "123.45")
const AMOUNT_PATTERN = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}';


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
 */
function extractDriverName(normalizedText: string): string | undefined {
  const driverMatch = normalizedText.match(OCR_PATTERNS.DRIVER);
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
  const pattern = new RegExp(`G/L\\s*#[^\\n]*AMOUNT[^\\n]*\\n[^\\n]*?(${AMOUNT_PATTERN})`, 'i');
  const match = normalizedText.match(pattern);
  return match ? parseFloat(match[1].replace(/,/g, '')) : undefined;
}

/**
 * Try extracting amount from TOTAL CHARGE header pattern
 */
function tryTotalChargePattern(normalizedText: string): number | undefined {
  const headerIdx = normalizedText.search(/TOTAL[\s\n]+CHARGE/i);
  if (headerIdx < 0) return undefined;
  
  const after = normalizedText.slice(headerIdx).split('\n');
  const amountRe = new RegExp(AMOUNT_PATTERN);
  
  // Find the first line containing an amount
  for (let k = 1; k < after.length; k++) {
    if (amountRe.test(after[k])) {
      const amounts = Array.from(after[k].matchAll(new RegExp(AMOUNT_PATTERN, 'g')));
      if (amounts.length > 0) {
        const lastAmount = amounts[amounts.length - 1][0];
        return parseFloat(lastAmount.replace(/,/g, ''));
      }
    }
  }
  
  return undefined;
}

/**
 * Try extracting amount from AMOUNT header with newline pattern
 */
function tryAmountHeaderPattern(normalizedText: string): number | undefined {
  const pattern = new RegExp(`AMOUNT[^\\n]*\\n[^\\d]*(${AMOUNT_PATTERN})`, 'i');
  const match = normalizedText.match(pattern);
  return match ? parseFloat(match[1].replace(/,/g, '')) : undefined;
}

/**
 * Try extracting amount from simple AMOUNT pattern
 */
function trySimpleAmountPattern(normalizedText: string): number | undefined {
  const pattern = new RegExp(`AMOUNT\\s+(${AMOUNT_PATTERN})`, 'i');
  const match = normalizedText.match(pattern);
  return match ? parseFloat(match[1].replace(/,/g, '')) : undefined;
}

/**
 * Extract advance amount using multiple strategies
 */
function extractAdvanceAmount(normalizedText: string): number | undefined {
  return tryGLAmountPattern(normalizedText)
    || tryTotalChargePattern(normalizedText)
    || tryAmountHeaderPattern(normalizedText)
    || trySimpleAmountPattern(normalizedText);
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
    errors.push(`Error parsing advance: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { lines, errors };
}
