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
import { parseSlashDate, addDaysUtc } from '../utils/date-parser.js';
import { parseSignedCurrency } from '../utils/string-utils.js';
import { WEEK_END_OFFSET_DAYS, WEEK_DURATION_DAYS, MIN_LINE_LENGTH, MAX_TRIP_NUMBER_LENGTH, AMOUNT_TOLERANCE } from '../constants.js';

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

// Note: MIN_LINE_LENGTH, MAX_TRIP_NUMBER_LENGTH, and AMOUNT_TOLERANCE
// are now imported from constants.ts

// Prefix for generated settlement detail payment references
const SETTLEMENT_DETAIL_REF_PREFIX = 'SD';

// Default agency name when not found in document
const DEFAULT_AGENCY_NAME = 'Unknown Agency';

// ===== PRECOMPILED REGEX PATTERNS (Performance Optimization) =====
// Compile regexes once at module level to avoid recompilation in loops

// Header detection patterns
const HEADER_BL_RE = /\bB\/L\b/;
const HEADER_TRIP_RE = /\bTRIP\b/;
const HEADER_TRANSACTION_RE = /TRANSACTION\/?DESCRIPTION/;
const HEADER_CHECK_TOTAL_RE = /CHECK\s+TOTAL/;
const HEADER_PAGE_RE = /\bPAGE\b/;

// Transaction line format patterns
const FULL_FORMAT_RE = /^(\d+)\s+(\d+)\s+(\d{2}\/\d{2}\/\d{2})\s+([A-Z]{2})\s+(.+?)\s+([\d,]+\.\d{2}-?)$/i;
const ONE_NUMBER_FORMAT_RE = /^(\d+)\s+(\d{2}\/\d{2}\/\d{2})\s+([A-Z]{2})\s+(.+?)\s+([\d,]+\.\d{2}-?)$/i;
const MINIMAL_FORMAT_RE = /^(\d{2}\/\d{2}\/\d{2})\s+([A-Z]{2})\s+(.+?)\s+([\d,]+\.\d{2}-?)$/i;

// Header extraction patterns
const ACCOUNT_NAME_RE = /ACCOUNT\s+\d+[^\n]*\n\s*([^\n]+)/i;
const CHECK_NUMBER_RE = /CHECK\s+(\d+)/i;
const CHECK_DATE_RE = /ON\s+(\d{2}\/\d{2}\/\d{2})/i;
const SETTLEMENT_DATE_RE = /AS\s+OF\s+(\d{2}\/\d{2}\/\d{2})/i;
const CHECK_TOTAL_RE = /CHECK\s+TOTAL[>\s]*(\d+,?\d*\.?\d+)/i;

// Normalization patterns
const TRANSACTION_DESC_SPLIT_RE = /TRANSACTION\s*\/\s*\n\s*DESCRIPTION/gi;
const SLASH_SPACING_RE = /\s*\/\s*/g;

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
      .replace(TRANSACTION_DESC_SPLIT_RE, 'TRANSACTION/DESCRIPTION')
      .replace(SLASH_SPACING_RE, '/');
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
 * Extract transaction line type from code
 */
function getLineType(transactionCode: string): 'REVENUE' | 'ADVANCE' | 'DEDUCTION' | 'OTHER' {
  return TRANSACTION_CODE_MAP[transactionCode] || 'OTHER';
}

/**
 * Check if a line is a header or invalid (should be skipped)
 */
function isHeaderOrInvalidLine(trimmed: string): boolean {
  return !trimmed ||
    HEADER_BL_RE.test(trimmed) ||
    HEADER_TRIP_RE.test(trimmed) ||
    HEADER_TRANSACTION_RE.test(trimmed) ||
    HEADER_CHECK_TOTAL_RE.test(trimmed) ||
    HEADER_PAGE_RE.test(trimmed) ||
    trimmed.length < MIN_LINE_LENGTH;
}

/**
 * Try parsing full format: B/L Trip Ref# Date Code Description Amount
 */
function tryFullFormat(trimmed: string): ParsedSettlementLine | null {
  const m = trimmed.match(FULL_FORMAT_RE);
  if (!m) return null;
  
  const [, n1, n2, date, code, description, amountStr] = m;
  const amount = parseSignedCurrency(amountStr);
  return {
    billOfLading: n1.length > MAX_TRIP_NUMBER_LENGTH ? n1 : undefined,
    tripNumber: n1.length > MAX_TRIP_NUMBER_LENGTH ? n2 : n1,
    referenceNumber: n1.length > MAX_TRIP_NUMBER_LENGTH ? undefined : n2,
    date: parseSlashDate(date) ?? date,
    transactionCode: code,
    description: description.trim(),
    amount,
    lineType: getLineType(code),
    rawLine: trimmed,
  };
}

/**
 * Try parsing one number format: Trip/Ref# Date Code Description Amount
 */
function tryOneNumberFormat(trimmed: string): ParsedSettlementLine | null {
  const m = trimmed.match(ONE_NUMBER_FORMAT_RE);
  if (!m) return null;
  
  const [, n1, date, code, description, amountStr] = m;
  const amount = parseSignedCurrency(amountStr);
  const isTrip = n1.length <= MAX_TRIP_NUMBER_LENGTH;
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

/**
 * Try parsing minimal format: Date Code Description Amount
 */
function tryMinimalFormat(trimmed: string): ParsedSettlementLine | null {
  const m = trimmed.match(MINIMAL_FORMAT_RE);
  if (!m) return null;
  
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

  // Skip headers and invalid lines
  if (isHeaderOrInvalidLine(trimmed)) {
    return null;
  }

  // Try parsing strategies from most specific to least
  return tryFullFormat(trimmed)
    || tryOneNumberFormat(trimmed)
    || tryMinimalFormat(trimmed);
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
  const nameMatch = text.match(ACCOUNT_NAME_RE);
  if (nameMatch) {
    result.accountName = nameMatch[1].trim();
  }

  // Extract check number: "CHECK 590668"
  const checkMatch = text.match(CHECK_NUMBER_RE);
  if (checkMatch) {
    result.checkNumber = checkMatch[1];
  }

  // Extract check date: "ON 12/18/25"
  const dateMatch = text.match(CHECK_DATE_RE);
  if (dateMatch) {
    result.checkDate = parseSlashDate(dateMatch[1]);
  }

  // Extract settlement date: "AS OF 12/03/25"
  const settlementMatch = text.match(SETTLEMENT_DATE_RE);
  if (settlementMatch) {
    result.settlementDate = parseSlashDate(settlementMatch[1]);
  }

  // Extract check total: "<CHECK TOTAL> 3,330.53"
  const totalMatch = text.match(CHECK_TOTAL_RE);
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
  // Default to Gemini if provider cannot be detected from text patterns
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
  const weekEndStr = addDaysUtc(checkDate, WEEK_END_OFFSET_DAYS);
  const weekStartStr = addDaysUtc(weekEndStr, WEEK_DURATION_DAYS);
  
  return {
    nvlPaymentRef: paymentRef || `${SETTLEMENT_DETAIL_REF_PREFIX}-${headerInfo.accountNumber}-${checkDate}`,
    agencyCode: headerInfo.accountNumber,
    agencyName: headerInfo.accountName || DEFAULT_AGENCY_NAME,
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
  // Default to Gemini if provider cannot be detected from text patterns
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to parse line: ${textLine.substring(0, 50)}... - ${errorMessage}`);
    }
  }

  // Validate: if we found a check total, verify our parsed lines sum to it
  // Note: Check total is the absolute net amount (always positive)
  if (headerInfo.checkTotal !== undefined && lines.length > 0) {
    const calculatedTotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const absoluteCalculated = Math.abs(calculatedTotal);
    const difference = Math.abs(absoluteCalculated - headerInfo.checkTotal);
    
    // Allow for small floating point errors
    if (difference > AMOUNT_TOLERANCE) {
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
