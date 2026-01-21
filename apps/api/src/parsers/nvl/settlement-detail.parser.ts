/**
 * Parser for SETTLEMENT_DETAIL document type (e.g., Page 2 of NVL settlement PDF)
 * Enhanced with flexible patterns to handle multiple OCR providers (Ollama, Gemini)
 * 
 * Extracts transaction lines from the settlement detail table which has the format:
 * B/L | TRIP | REF # | DATE | TRANSACTION/DESCRIPTION | AMOUNT | COMMENTS
 * 
 * Example lines:
 * 1855 590493 12/02/25 CM COMDATA 518.00
 * 12/10/25 MC MOTOR VEH REP 5.25
 * 356985 1854 12/12/25 RD REVENUE DISTR 3,890.63-
 */

import { normalizeOcrText, OCR_PATTERNS } from '../../utils/ocr-normalizer.js';

export interface ParsedSettlementLine {
  billOfLading?: string;
  tripNumber?: string;
  referenceNumber?: string;
  date: string;
  transactionCode: string;
  description: string;
  amount: number;
  lineType: 'REVENUE' | 'ADVANCE' | 'DEDUCTION' | 'OTHER';
  rawLine: string;
}

export interface SettlementDetailParseResult {
  accountNumber?: string;
  accountName?: string;
  checkNumber?: string;
  checkDate?: string;
  lines: ParsedSettlementLine[];
  checkTotal?: number;
  errors: string[];
}

/**
 * Maps NVL transaction codes to line types
 */
const TRANSACTION_CODE_MAP: Record<string, 'REVENUE' | 'ADVANCE' | 'DEDUCTION' | 'OTHER'> = {
  RD: 'REVENUE',      // Revenue Distribution
  CM: 'ADVANCE',      // Comdata (cash advance)
  CA: 'ADVANCE',      // Cash Advance
  MC: 'DEDUCTION',    // Miscellaneous Charge
  PT: 'DEDUCTION',    // Posting Ticket
  CL: 'DEDUCTION',    // Claims
  CD: 'DEDUCTION',    // Cash Disbursement
  UA: 'DEDUCTION',    // Unapplied Deduction
  POA: 'OTHER',       // Payment on Account
};

/**
 * Parse amount string, handling negative values with trailing minus sign
 * Examples: "518.00" -> 518.00, "3,890.63-" -> -3890.63
 */
function parseAmount(amountStr: string): number {
  const cleaned = amountStr.replace(/,/g, '').trim();
  const isNegative = cleaned.endsWith('-');
  const numericStr = cleaned.replace(/-/g, '');
  const value = parseFloat(numericStr);
  return isNegative ? -value : value;
}

/**
 * Parse a date string in MM/DD/YY format to ISO date string
 * Assumes 20xx for year (e.g., 12/02/25 -> 2025-12-02)
 */
function parseDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) {
    return dateStr;
  }
  const [month, day, year] = parts;
  const fullYear = `20${year}`;
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Extract transaction line type from code
 */
function getLineType(transactionCode: string): 'REVENUE' | 'ADVANCE' | 'DEDUCTION' | 'OTHER' {
  return TRANSACTION_CODE_MAP[transactionCode] || 'OTHER';
}

/**
 * Parse a single transaction line from the settlement detail table
 * 
 * Line formats:
 * 1. Full: B/L TRIP REF# DATE CODE DESCRIPTION AMOUNT
 *    Example: 1855 590493 12/02/25 CM COMDATA 518.00
 * 
 * 2. No B/L: TRIP REF# DATE CODE DESCRIPTION AMOUNT
 *    Example: 256483 12/12/25 PT OTHER CHARGES 10.00
 * 
 * 3. Minimal: DATE CODE DESCRIPTION AMOUNT
 *    Example: 12/10/25 MC MOTOR VEH REP 5.25
 * 
 * 4. With B/L on separate line: B/L TRIP DATE CODE DESCRIPTION AMOUNT
 *    Example: 356985 1854 12/12/25 RD REVENUE DISTR 3,890.63-
 */
function parseTransactionLine(line: string): ParsedSettlementLine | null {
  const trimmed = line.trim();
  
  // Skip empty lines, headers, and other non-data lines
  if (!trimmed || 
      trimmed.includes('B/L') || 
      trimmed.includes('TRIP') ||
      trimmed.includes('TRANSACTION/DESCRIPTION') ||
      trimmed.includes('CHECK TOTAL') ||
      trimmed.includes('PAGE') ||
      trimmed.length < 10) {
    return null;
  }

  // Pattern to match transaction lines with up to 3 optional leading numbers
  // Captures: all leading numbers, date, code, description, amount
  // Amount can be: 518.00, 3,890.63, 3,890.63-, etc.
  const pattern = /^([\d\s]+)?(\d{2}\/\d{2}\/\d{2})\s+([A-Z]{2})\s+(.+?)\s+([\d,]+\.\d{2}-?)$/;
  
  const match = trimmed.match(pattern);
  if (!match) {
    return null;
  }

  const [, leadingNumbers, date, code, description, amountStr] = match;

  // Parse leading numbers (can be B/L, Trip, Ref# in various combinations)
  let billOfLading: string | undefined;
  let tripNumber: string | undefined;
  let referenceNumber: string | undefined;

  if (leadingNumbers) {
    const numbers = leadingNumbers.trim().split(/\s+/);
    
    if (numbers.length === 3) {
      // B/L Trip Ref#
      [billOfLading, tripNumber, referenceNumber] = numbers;
    } else if (numbers.length === 2) {
      // Could be: B/L Trip, or Trip Ref#
      // Heuristic: if first number is long (>4 digits), it's likely B/L
      if (numbers[0].length > 4) {
        [billOfLading, tripNumber] = numbers;
      } else {
        [tripNumber, referenceNumber] = numbers;
      }
    } else if (numbers.length === 1) {
      // Could be Trip or Ref# - use length heuristic
      if (numbers[0].length <= 4) {
        tripNumber = numbers[0];
      } else {
        referenceNumber = numbers[0];
      }
    }
  }

  const amount = parseAmount(amountStr);
  const lineType = getLineType(code);

  return {
    billOfLading,
    tripNumber,
    referenceNumber,
    date: parseDate(date),
    transactionCode: code,
    description: description.trim(),
    amount,
    lineType,
    rawLine: trimmed,
  };
}

/**
 * Extract header information from the settlement detail document
 */
function extractHeaderInfo(text: string): {
  accountNumber?: string;
  accountName?: string;
  checkNumber?: string;
  checkDate?: string;
  checkTotal?: number;
} {
  const result: ReturnType<typeof extractHeaderInfo> = {};

  // Extract account number: "ACCOUNT 03101" (remove leading zeros)
  const accountMatch = text.match(OCR_PATTERNS.ACCOUNT);
  if (accountMatch) {
    result.accountNumber = accountMatch[1].replace(/^0+/, '');
  }

  // Extract account name (usually appears after account number)
  // Example: "CICEROS' MOVING & STORAGE LLC"
  const nameMatch = text.match(/ACCOUNT\s+\d+[^\n]*\n\s*([^\n]+)/i);
  if (nameMatch) {
    result.accountName = nameMatch[1].trim();
  }

  // Extract check number: "CHECK 590668"
  const checkMatch = text.match(/CHECK\s+(\d+)/i);
  if (checkMatch) {
    result.checkNumber = checkMatch[1];
  }

  // Extract check date: "ON 12/18/25"
  const dateMatch = text.match(/ON\s+(\d{2}\/\d{2}\/\d{2})/i);
  if (dateMatch) {
    result.checkDate = parseDate(dateMatch[1]);
  }

  // Extract check total: "<CHECK TOTAL> 3,330.53"
  const totalMatch = text.match(/CHECK\s+TOTAL[>\s]*(\d+,?\d*\.?\d+)/i);
  if (totalMatch) {
    result.checkTotal = parseAmount(totalMatch[1]);
  }

  return result;
}

/**
 * Main parser function for SETTLEMENT_DETAIL documents
 * Handles both Ollama and Gemini OCR output formats
 */
export function parseSettlementDetail(ocrText: string): SettlementDetailParseResult {
  const errors: string[] = [];
  const lines: ParsedSettlementLine[] = [];

  // Normalize text to handle format variations between OCR providers
  const normalizedText = normalizeOcrText(ocrText, 'gemini');

  // Extract header information
  const headerInfo = extractHeaderInfo(normalizedText);

  // Split text into lines and parse each one
  const textLines = normalizedText.split('\n');

  for (const textLine of textLines) {
    try {
      const parsed = parseTransactionLine(textLine);
      if (parsed) {
        lines.push(parsed);
      }
    } catch (error) {
      errors.push(`Failed to parse line: ${textLine.substring(0, 50)}... - ${error}`);
    }
  }

  // Validate: if we found a check total, verify our parsed lines sum to it
  // Note: Check total is the absolute net amount (always positive)
  if (headerInfo.checkTotal !== undefined && lines.length > 0) {
    const calculatedTotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const absoluteCalculated = Math.abs(calculatedTotal);
    const difference = Math.abs(absoluteCalculated - headerInfo.checkTotal);
    
    if (difference > 0.01) { // Allow for small floating point errors
      errors.push(
        `Check total mismatch: parsed ${absoluteCalculated.toFixed(2)} but expected ${headerInfo.checkTotal.toFixed(2)}`
      );
    }
  }

  return {
    ...headerInfo,
    lines,
    errors,
  };
}
