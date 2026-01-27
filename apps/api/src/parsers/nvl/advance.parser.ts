/**
 * Regex-based parser for ADVANCE_ADVICE document type
 * 
 * Advance documents show cash advances given to drivers (COMDATA, etc.)
 * Enhanced with flexible patterns to handle multiple OCR providers (Ollama, Gemini)
 */

import { normalizeOcrText, OCR_PATTERNS } from '../../utils/ocr-normalizer.js';

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
 * Parse date in MMDDYY format to ISO string
 */
function parseDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  const match = dateStr.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    const [, month, day, year] = match;
    const fullYear = `20${year}`;
    return `${fullYear}-${month}-${day}`;
  }
  
  return undefined;
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
    const normalizedText = normalizeOcrText(ocrText, 'gemini');

    // Extract trip number using flexible pattern
    const tripMatch = normalizedText.match(OCR_PATTERNS.TRIP);
    const tripNumber = tripMatch ? tripMatch[1] : undefined;

    // Extract account number (remove leading zeros)
    const accountMatch = normalizedText.match(OCR_PATTERNS.ACCOUNT);
    const accountNumber = accountMatch ? accountMatch[1].replace(/^0+/, '') : undefined;

    // Extract driver name (format: LASTNAME, FIRSTNAME or just name)
    // Handles variations like "DRIVER-- BIDETTI, DONNY" or "DRIVER--\nBIDETTI, DONNY"
    const driverMatch = normalizedText.match(OCR_PATTERNS.DRIVER);
    const driverName = driverMatch ? driverMatch[1].trim().replace(/\s+/g, ' ') : undefined;

    // Extract advance amount with flexible patterns
    // The correct amount is in the "AMOUNT" field after the G/L # line
    // Format: "G/L #\n1856\n2032-01\nAMOUNT\n1033.00\nACCOUNT NAME"
    let advanceAmount = 0;
    
    // Strategy 1: Look for "AMOUNT" followed by number, then "ACCOUNT NAME" (most reliable)
    // This is the dedicated amount field after the G/L section
    let amountMatch = normalizedText.match(/AMOUNT\s+(\d+\.\d{2})\s+ACCOUNT\s+NAME/i);
    
    if (!amountMatch) {
      // Strategy 2: Simple "AMOUNT" followed by number
      amountMatch = normalizedText.match(/AMOUNT\s+(\d+\.\d{2})/i);
    }
    
    if (!amountMatch) {
      // Strategy 3: More flexible - any non-digit chars between AMOUNT and number
      amountMatch = normalizedText.match(/AMOUNT[^\d]+(\d+\.\d{2})/i);
    }
    
    if (!amountMatch) {
      // Strategy 4: Look for "TOTAL\nCHARGE\n1033.00" format (last column in table)
      amountMatch = normalizedText.match(/TOTAL[\s\n]+CHARGE[\s\n]+(\d{1,3}(?:,\d{3})*\.\d{2})/i);
    }
    
    if (amountMatch) {
      advanceAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
    } else {
      errors.push('Could not extract advance amount from document');
    }

    // Extract date with flexible patterns
    // Handles: "DATE--> 120525", "DATE\n120525", etc.
    const dateMatch = normalizedText.match(/DATE[-\s]*>?\s*\n?\s*(\d{6})/i);
    const date = parseDate(dateMatch ? dateMatch[1] : undefined);

    // Determine description (COMDATA, CASH ADVANCE, etc.)
    let description = 'COMDATA';
    if (ocrText.toUpperCase().includes('COMDATA')) {
      description = 'COMDATA';
    } else if (ocrText.toUpperCase().includes('CASH ADVANCE')) {
      description = 'CASH ADVANCE';
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
    errors.push(`Error parsing advance: ${error}`);
  }

  return { lines, errors };
}
