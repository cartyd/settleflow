/**
 * Regex-based parser for REMITTANCE document type
 * 
 * This is the cover page with check/payment information
 * 
 * Example structure (Page 1):
 * - Check number: 590668
 * - Check date: 12/18/25
 * - Check amount: $3,330.53
 * - Payee: CICEROS MOVING & STORAGE LLC
 * - Account: 3101
 * - Bank account: 590034319
 * - Payment method: Electronic transfer or Check
 */

import { parseSlashDate } from '../utils/date-parser.js';
import { normalizeOcrText, detectOcrProvider } from '../../utils/ocr-normalizer.js';

// Type for payment method to ensure consistency
type PaymentMethod = 'Electronic Transfer' | 'Check';

// Local scan limits for top-of-document heuristics
// NVL remittance checks typically place check number in first 10 lines
const CHECK_SCAN_TOP_LINES = 10;
// Account numbers can appear further down in various formats
const ACCOUNT_SCAN_TOP_LINES = 20;

// Week calculation offsets relative to check date
// Settlement week ends 7 days before check date
const WEEK_END_OFFSET_DAYS = -7;
// Settlement week spans 7 days (start is 6 days before end)
const WEEK_DURATION_DAYS = -6;

// Character class for company names: supports ASCII, diacritics, apostrophes (straight & curly), ampersands, hyphens
const COMPANY_NAME_CHARS = `[A-ZÀ-ÿ''&,.\-\s]+`;
// UTC-safe date arithmetic to avoid timezone/DST drift
function addDaysUtc(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export interface RemittanceLine {
  checkNumber?: string;
  checkDate?: string;
  checkAmount?: number;
  payeeName?: string;
  payeeAddress?: string;
  bankAccount?: string;
  paymentMethod?: PaymentMethod;
  accountNumber?: string;
  reference?: string;
  rawText: string;
}

export interface RemittanceParseResult {
  lines: RemittanceLine[];
  errors: string[];
  metadata?: BatchMetadata;
}

export interface BatchMetadata {
  nvlPaymentRef: string;
  agencyCode: string;
  agencyName: string;
  checkDate: string;
  weekStartDate?: string;
  weekEndDate?: string;
}


/**
 * Extract check number from the document
 * Pattern: 6-digit number appearing early in document or after "CHECK" keyword
 */
function extractCheckNumber(text: string): string | undefined {
  // Try to find check number after "CHECK" keyword
  const checkMatch = text.match(/CHECK\s+(\d{6})/i);
  if (checkMatch) {
    return checkMatch[1];
  }

  // Try to find check number in payment detail section
  const detailMatch = text.match(/PAYMENT\s+PER\s+ATTACHED\s+(\d{6})/i);
  if (detailMatch) {
    return detailMatch[1];
  }

  // Look for 6-digit number near the top (usually standalone line)
  const lines = text.split('\n');
  for (let i = 0; i < Math.min(CHECK_SCAN_TOP_LINES, lines.length); i++) {
    const line = lines[i].trim();
    if (/^\d{6}$/.test(line)) {
      return line;
    }
  }

  return undefined;
}

/**
 * Extract check date from the document
 * Pattern: DATE MM/DD/YY or date in "PAY TO THE ORDER OF" line
 */
function extractCheckDate(text: string): string | undefined {
  // Try "DATE MM/DD/YY" pattern
  const dateMatch = text.match(/DATE\s+(\d{1,2}\/\d{1,2}\/\d{2})/i);
  if (dateMatch) {
    return parseSlashDate(dateMatch[1]);
  }

  // Try date in "PAY TO THE ORDER OF" line
  const payMatch = text.match(/PAY TO THE ORDER OF.*?DATE\s+(\d{1,2}\/\d{1,2}\/\d{2})/i);
  if (payMatch) {
    return parseSlashDate(payMatch[1]);
  }

  return undefined;
}

/**
 * Extract check amount from the document
 * Pattern: AMOUNT $X,XXX.XX or in the account table
 */
function extractCheckAmount(text: string): number | undefined {
  // Try "AMOUNT $X,XXX.XX" pattern
  const amountMatch = text.match(/AMOUNT\s+\$[\*]*([0-9,]+\.\d{2})/i);
  if (amountMatch) {
    const cleanAmount = amountMatch[1].replace(/,/g, '');
    return parseFloat(cleanAmount);
  }

  // Try amount in account table (second column after account number)
  const tableMatch = text.match(/ACCOUNT\s+NUMBER\s+AMOUNT.*?\n.*?(\d+)\s+([0-9,]+\.\d{2})/is);
  if (tableMatch) {
    const cleanAmount = tableMatch[2].replace(/,/g, '');
    return parseFloat(cleanAmount);
  }

  return undefined;
}

/**
 * Extract payee name from the document
 * Pattern: Name line after "PAY TO THE ORDER OF" or "TO THE ORDER OF"
 */
function extractPayeeName(text: string): string | undefined {
  // Try standard format first
  const payMatch = text.match(/PAY TO THE ORDER OF[^\n]*\n\s*([^\n]+)/i);
  if (payMatch) {
    return payMatch[1].trim();
  }

  // Try Gemini format with line breaks: TO THE\nORDER\nOF\nDATE...\nNAME
  // Look for name between AMOUNT and next section
  const companyPattern = new RegExp(`AMOUNT\\s+\\$[^\\n]*\\n\\s*([A-Z]${COMPANY_NAME_CHARS}(?:LLC|INC|CORP|LTD))(?=\\s|\\n)`, 'i');
  const geminiMatch = text.match(companyPattern);
  if (geminiMatch) {
    return geminiMatch[1].trim();
  }
  
  // Alternative: Name appears after amount/date section
  const altPattern = new RegExp(`TO THE[\\s\\n]+ORDER[\\s\\n]+OF[\\s\\n]+(?:DATE[^\\n]*\\n)?(?:AMOUNT[^\\n]*\\n)?\\s*([A-Z]${COMPANY_NAME_CHARS}?)(?:\\n|$)`, 'i');
  const altMatch = text.match(altPattern);
  if (altMatch) {
    const name = altMatch[1].trim();
    // Make sure it's not a header/keyword
    if (!name.match(/^(NON-NEGOTIABLE|REMITTANCE|DETAIL|PAYMENT|BANK)$/i)) {
      return name;
    }
  }

  return undefined;
}

/**
 * Extract payee address from the document
 * Pattern: Address lines after payee name (P.O. BOX or street address with city/state/zip)
 */
function extractPayeeAddress(text: string): string | undefined {
  // Look for address pattern (P.O. BOX or city state zip)
  const addressMatch = text.match(/([^\n]*(?:P\.\s*O\.\s*BOX|BOX)[^\n]*\n[^\n]*\d{5}(?:-\d{4})?)/i);
  if (addressMatch) {
    return addressMatch[1].trim().replace(/\s+/g, ' ');
  }

  return undefined;
}

/**
 * Extract bank account number from the document
 * Pattern: BANK ACCT#XXXXXXXXX
 */
function extractBankAccount(text: string): string | undefined {
  const bankMatch = text.match(/BANK\s+ACCT\s*#\s*(\d+)/i);
  if (bankMatch) {
    return bankMatch[1];
  }

  return undefined;
}

/**
 * Extract payment method from the document
 * Pattern: Check for "ELECTRONICALLY TRANSFERRED" or default to "CHECK"
 */
function extractPaymentMethod(text: string): PaymentMethod | undefined {
  if (text.match(/ELECTRONICALLY\s+TRANSFERRED/i)) {
    return 'Electronic Transfer';
  }

  if (text.match(/NON-NEGOTIABLE/i)) {
    return 'Check';
  }

  return undefined;
}

/**
 * Remove leading zeros from account number, preserving at least one digit
 */
function removeLeadingZeros(accountNumber: string): string {
  return accountNumber.replace(/^0+/, '') || accountNumber;
}

/**
 * Try extracting account from "GENERAL LEDGER AGENT" pattern
 */
function tryGeneralLedgerPattern(text: string): string | undefined {
  const match = text.match(/GENERAL\s+LEDGER\s+AGENT[\s\n]+(\d{3,5})/i);
  return match?.[1];
}

/**
 * Try extracting account from account table format
 */
function tryTablePattern(text: string): string | undefined {
  const match = text.match(/ACCOUNT\s+NUMBER.*?\n.*?(\d+)\s+[0-9,]+\.\d{2}/is);
  return match?.[1];
}

/**
 * Try extracting account from top of document (Gemini format)
 */
function tryTopOfDocumentPattern(text: string): string | undefined {
  const lines = text.split('\n');
  for (let i = 0; i < Math.min(ACCOUNT_SCAN_TOP_LINES, lines.length); i++) {
    const match = lines[i].match(/^ACCOUNT\s+(0?\d{3,5})$/i);
    if (match) {
      return removeLeadingZeros(match[1]);
    }
  }
  return undefined;
}

/**
 * Try extracting account from simple "ACCOUNT XXXX" pattern
 */
function trySimpleAccountPattern(text: string): string | undefined {
  const match = text.match(/ACCOUNT\s+(0?\d{3,5})/i);
  if (match) {
    return removeLeadingZeros(match[1]);
  }
  return undefined;
}

/**
 * Try extracting account from "AGENCY ACCOUNT" at document bottom
 */
function tryAgencyAccountPattern(text: string): string | undefined {
  const match = text.match(/AGENCY ACCOUNT[\s\S]*?GENERAL LEDGER\s+(\d+)/i);
  return match?.[1];
}

/**
 * Extract account number from the document
 * Pattern: Account number in the account table or "ACCOUNT XXXX"
 */
function extractAccountNumber(text: string): string | undefined {
  // Try patterns in order of reliability
  return tryGeneralLedgerPattern(text)
    || tryTablePattern(text)
    || tryTopOfDocumentPattern(text)
    || trySimpleAccountPattern(text)
    || tryAgencyAccountPattern(text);
}

/**
 * Calculate week start and end dates from check date
 * Assumes settlement is for the week ending ~1 week before check date
 */
function calculateWeekDates(checkDate: string): { weekStartDate: string; weekEndDate: string } | undefined {
  // Validate ISO date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkDate)) {
    return undefined;
  }
  
  try {
    // Use UTC math on ISO date strings to avoid TZ/DST drift
    const weekEndDate = addDaysUtc(checkDate, WEEK_END_OFFSET_DAYS);
    const weekStartDate = addDaysUtc(weekEndDate, WEEK_DURATION_DAYS);
    return { weekStartDate, weekEndDate };
  } catch (error) {
    console.warn(`Failed to calculate week dates from check date: ${checkDate}`, error);
    return undefined;
  }
}

/**
 * Parse REMITTANCE document using regex patterns
 */
export function parseRemittance(ocrText: string): RemittanceParseResult {
  const errors: string[] = [];
  const lines: RemittanceLine[] = [];
  let metadata: BatchMetadata | undefined;

  try {
    // Normalize OCR text based on detected provider (Ollama, Gemini, etc.)
    const provider = detectOcrProvider(ocrText);
    const normalizedText = normalizeOcrText(ocrText, provider);

    const checkNumber = extractCheckNumber(normalizedText);
    const checkDate = extractCheckDate(normalizedText);
    const checkAmount = extractCheckAmount(normalizedText);
    const payeeName = extractPayeeName(normalizedText);
    const payeeAddress = extractPayeeAddress(normalizedText);
    const bankAccount = extractBankAccount(normalizedText);
    const paymentMethod = extractPaymentMethod(normalizedText);
    const accountNumber = extractAccountNumber(normalizedText);

    // Validate that we extracted at least the essential fields
    if (!checkNumber && !checkAmount) {
      errors.push('Could not extract check number or amount from remittance document');
      // Still create a line with available data rather than skipping completely
    }

    const line: RemittanceLine = {
      checkNumber,
      checkDate,
      checkAmount,
      payeeName,
      payeeAddress,
      bankAccount,
      paymentMethod,
      accountNumber,
      reference: checkNumber, // Use check number as reference
      rawText: ocrText,
    };

    lines.push(line);

    // Extract batch metadata if we have the essential fields
    
    if (checkNumber && accountNumber && checkDate) {
      const weekDates = calculateWeekDates(checkDate);
      
      metadata = {
        nvlPaymentRef: checkNumber,
        agencyCode: accountNumber,
        agencyName: payeeName || 'Unknown Agency',
        checkDate: checkDate,
        weekStartDate: weekDates?.weekStartDate,
        weekEndDate: weekDates?.weekEndDate,
      };
    } else {
      const missing = [];
      if (!checkNumber) missing.push('checkNumber');
      if (!accountNumber) missing.push('accountNumber');
      if (!checkDate) missing.push('checkDate');
      errors.push(`Missing required fields: ${missing.join(', ')}`);
    }
  } catch (error) {
    errors.push(`Parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { lines, errors, metadata };
}
