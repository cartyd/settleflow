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

import { normalizeOcrText, OCR_PATTERNS, detectOcrProvider, OcrProvider } from '../../utils/ocr-normalizer.js';
import { parseSlashDate } from '../utils/date-parser.js';
import { parseSignedCurrency } from '../utils/string-utils.js';
import { WEEK_END_OFFSET_DAYS, WEEK_DURATION_DAYS } from '../constants.js';

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
  settlementDate?: string;
  lines: ParsedSettlementLine[];
  checkTotal?: number;
  errors: string[];
}

export interface SettlementBatchMetadata {
  nvlPaymentRef: string;
  agencyCode: string;
  agencyName: string;
  checkDate: string;
  weekStartDate?: string;
  weekEndDate?: string;
}

/**
 * Light normalization for settlement detail: preserve line breaks and spacing.
 * Avoids collapsing whitespace sequences to keep table rows intact.
 */
function normalizeForSettlement(text: string, provider?: OcrProvider): string {
  if (!text) return '';
  let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Trim trailing spaces per line
  t = t.replace(/[ \t]+$/gm, '');
  if (provider === 'gemini') {
    // Minimal fixes for Gemini-specific splits without altering spacing drastically
    t = t
      .replace(/TRANSACTION\s*\/\s*\n\s*DESCRIPTION/gi, 'TRANSACTION/DESCRIPTION')
      .replace(/\s*\/\s*/g, '/');
  }
  return t;
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
    /\bB\/L\b/.test(trimmed) ||
    /\bTRIP\b/.test(trimmed) ||
    /TRANSACTION\/?DESCRIPTION/.test(trimmed) ||
    /CHECK\s+TOTAL/.test(trimmed) ||
    /\bPAGE\b/.test(trimmed) ||
    trimmed.length < 10) {
    return null;
  }

  // Try patterns from most specific to least
  // 1) B/L Trip Ref# Date Code Desc Amount
  let m = trimmed.match(new RegExp('^(\\d+)\\s+(\\d+)\\s+(\\d{2}\\/\\d{2}\\/\\d{2})\\s+([A-Z]{2})\\s+(.+?)\\s+([\\d,]+\\.\\d{2}-?)$', 'i'));
  if (m) {
    const [, n1, n2, date, code, description, amountStr] = m;
    const amount = parseSignedCurrency(amountStr);
    return {
      billOfLading: n1.length > 4 ? n1 : undefined,
      tripNumber: n1.length > 4 ? n2 : n1,
      referenceNumber: n1.length > 4 ? undefined : n2,
      date: parseSlashDate(date) ?? date,
      transactionCode: code,
      description: description.trim(),
      amount,
      lineType: getLineType(code),
      rawLine: trimmed,
    };
  }

  // 2) One number + Date Code Desc Amount (Trip or Ref#)
  m = trimmed.match(new RegExp('^(\\d+)\\s+(\\d{2}\\/\\d{2}\\/\\d{2})\\s+([A-Z]{2})\\s+(.+?)\\s+([\\d,]+\\.\\d{2}-?)$', 'i'));
  if (m) {
    const [, n1, date, code, description, amountStr] = m;
    const amount = parseSignedCurrency(amountStr);
    const isTrip = n1.length <= 4;
    return {
      tripNumber: isTrip ? n1 : undefined,
      referenceNumber: isTrip ? undefined : n1,
      date: parseSlashDate(date) ?? date,
      transactionCode: code,
      description: description.trim(),
      amount,
      lineType: getLineType(code),
      rawLine: trimmed,
    };
  }

  // 3) Date Code Desc Amount (minimal)
  m = trimmed.match(new RegExp('^(\\d{2}\\/\\d{2}\\/\\d{2})\\s+([A-Z]{2})\\s+(.+?)\\s+([\\d,]+\\.\\d{2}-?)$', 'i'));
  if (m) {
    const [, date, code, description, amountStr] = m;
    const amount = parseSignedCurrency(amountStr);
    return {
      date: parseSlashDate(date) ?? date,
      transactionCode: code,
      description: description.trim(),
      amount,
      lineType: getLineType(code),
      rawLine: trimmed,
    } as ParsedSettlementLine;
  }

  return null;
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
  settlementDate?: string;
} {
  const result: ReturnType<typeof extractHeaderInfo> = {};

  // Extract account number: "ACCOUNT 03101" (remove leading zeros)
  const accountMatch = text.match(OCR_PATTERNS.ACCOUNT);
  if (accountMatch) {
    // Preserve leading zeros for SETTLEMENT_DETAIL account number (e.g., 03101)
    result.accountNumber = accountMatch[1];
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
    result.checkDate = parseSlashDate(dateMatch[1]);
  }

  // Extract settlement date: "AS OF 12/03/25"
  const settlementMatch = text.match(/AS\s+OF\s+(\d{2}\/\d{2}\/\d{2})/i);
  if (settlementMatch) {
    result.settlementDate = parseSlashDate(settlementMatch[1]);
  }

  // Extract check total: "<CHECK TOTAL> 3,330.53"
  const totalMatch = text.match(/CHECK\s+TOTAL[>\s]*(\d+,?\d*\.?\d+)/i);
  if (totalMatch) {
    result.checkTotal = parseSignedCurrency(totalMatch[1]);
  }

  return result;
}

/**
 * Extract batch metadata from SETTLEMENT_DETAIL document
 * Used as fallback when no REMITTANCE page is available
 */
export function extractBatchMetadata(ocrText: string): SettlementBatchMetadata | null {
  const provider = detectOcrProvider(ocrText) ?? 'gemini';
  const normalizedText = normalizeForSettlement(ocrText, provider);
  const headerInfo = extractHeaderInfo(normalizedText);
  
  // Generate a payment reference from settlement date if no check number
  let paymentRef = headerInfo.checkNumber;
  if (!paymentRef && headerInfo.settlementDate) {
    // Use settlement date as payment ref: 2025-12-03 -> 20251203
    paymentRef = headerInfo.settlementDate.replace(/-/g, '');
  }
  
  // Need at least account number and a date
  if (!headerInfo.accountNumber || (!headerInfo.checkDate && !headerInfo.settlementDate)) {
    return null;
  }
  
  const checkDate = headerInfo.checkDate || headerInfo.settlementDate!;
  
  // Calculate week dates from check/settlement date using UTC-safe arithmetic
  function addDaysUtc(isoDate: string, days: number): string {
    const [y, m, d] = isoDate.split('-').map(Number);
    if (!y || !m || !d) return isoDate;
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }
  const weekEndStr = addDaysUtc(checkDate, WEEK_END_OFFSET_DAYS);
  const weekStartStr = addDaysUtc(weekEndStr, WEEK_DURATION_DAYS);
  
  return {
    nvlPaymentRef: paymentRef || `SD-${headerInfo.accountNumber}-${checkDate}`,
    agencyCode: headerInfo.accountNumber,
    agencyName: headerInfo.accountName || 'Unknown Agency',
    checkDate,
    weekStartDate: weekStartStr,
    weekEndDate: weekEndStr,
  };
}

/**
 * Main parser function for SETTLEMENT_DETAIL documents
 * Handles both Ollama and Gemini OCR output formats
 */
export function parseSettlementDetail(ocrText: string): SettlementDetailParseResult {
  const errors: string[] = [];
  const lines: ParsedSettlementLine[] = [];

  // Normalize text to handle format variations between OCR providers
  const provider = detectOcrProvider(ocrText) ?? 'gemini';
  const normalizedText = normalizeForSettlement(ocrText, provider);

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
