/**
 * Regex-based parser for CREDIT_DEBIT document type
 * 
 * These are form-based documents showing individual charges or credits
 * Enhanced with flexible patterns to handle multiple OCR providers (Ollama, Gemini)
 * 
 * Example structure (Pages 6-10):
 * - Transaction type: SAFETY CHARGEBACKS, PROFILE SEO, ELD SRVC FEE
 * - Description: MOTOR VEH REP, PROFILE SEO, ELD SRVC FEE
 * - Amount: Debit or Credit
 * - Date: Entry date and process date (MMDDYY format like 121625)
 * - Account info
 */

import { normalizeOcrText, OCR_PATTERNS } from '../../utils/ocr-normalizer.js';

export interface CreditDebitLine {
  transactionType?: string;
  description: string;
  amount: number;
  isDebit: boolean;
  entryDate?: string;
  processDate?: string;
  accountNumber?: string;
  reference?: string;
  rawText: string;
}

export interface CreditDebitParseResult {
  lines: CreditDebitLine[];
  errors: string[];
}

/**
 * Parse date string to ISO format
 * Handles: YYYY-MM-DD, MM/DD/YY, MMDDYY (6 digits) formats
 */
function parseDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  const cleanStr = dateStr.trim();
  
  // Try MMDDYY format (6 digits, no separators) - e.g., 121625 = 12/16/25
  const compactMatch = cleanStr.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, month, day, year] = compactMatch;
    const fullYear = `20${year}`;
    return `${fullYear}-${month}-${day}`;
  }
  
  // Try YYYY-MM-DD format
  const isoMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return cleanStr;
  }
  
  // Try MM/DD/YY format
  const slashMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const fullYear = `20${year}`;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return undefined;
}

/**
 * Extract transaction type from the document
 * Pattern: Line after "TRANSACTION TYPE" header
 */
function extractTransactionType(text: string): string | undefined {
  const match = text.match(/TRANSACTION\s+TYPE[\s\t]*\n\s*([^\n\t]+)/i);
  if (match) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Extract description from the document
 * Pattern: First non-empty value after "DESCRIPTION" header or in DEBITS/CREDITS section
 */
function extractDescription(text: string): string {
  // Try to find description in tab-separated format (DESCRIPTION\tDEBITS\tCREDITS\nVALUE\t...)
  const tabMatch = text.match(/DESCRIPTION[\s\t]+DEBITS[\s\t]+CREDITS[\s\t]*\n([^\t\n]+)[\s\t]+\d+\.\d{2}/i);
  if (tabMatch && tabMatch[1].trim()) {
    return tabMatch[1].trim();
  }

  // Try to find description after "DESCRIPTION" label on separate line
  const descMatch = text.match(/DESCRIPTION[\s\t]*\n\s*([^\n\t]+)/i);
  if (descMatch && descMatch[1].trim() && !descMatch[1].match(/DEBITS|CREDITS/i)) {
    return descMatch[1].trim();
  }

  // Fallback: use transaction type if available
  const transType = extractTransactionType(text);
  if (transType) {
    return transType;
  }

  return 'Unknown';
}

/**
 * Extract entry date from the document
 * Pattern: Date after "N.V.L ENTRY" or "NVL ENTRY" label (MMDDYY format)
 */
function extractEntryDate(text: string): string | undefined {
  const match = text.match(/N\.?V\.?L\.?\s+ENTRY[\s\t]*\n?[\s\t]*(\d{6})/i);
  if (match) {
    return parseDate(match[1]);
  }
  return undefined;
}

/**
 * Extract process date from the document
 * Pattern: Date after "PROCESS DATE" or "PROCESS" label (MMDDYY format)
 */
function extractProcessDate(text: string): string | undefined {
  // Try "PROCESS DATE" pattern
  let match = text.match(/PROCESS\s+DATE[\s\t]*\n?[\s\t]*(\d{6})/i);
  if (match) {
    return parseDate(match[1]);
  }

  // Try standalone "PROCESS" label followed by date
  match = text.match(/PROCESS[\s\t]*\n?[\s\t]*(\d{6})/i);
  if (match) {
    return parseDate(match[1]);
  }

  return undefined;
}

/**
 * Extract account number from the document
 * Pattern: Number after "ACCOUNT NUMBER" label
 * Handles line breaks and removes leading zeros
 */
function extractAccountNumber(text: string): string | undefined {
  const match = text.match(OCR_PATTERNS.ACCOUNT);
  if (match) {
    return match[1].replace(/^0+/, ''); // Remove leading zeros
  }
  return undefined;
}

/**
 * Extract amount and determine if debit or credit
 * Pattern: Amount in DEBITS or CREDITS column
 */
function extractAmountAndType(text: string): { amount: number; isDebit: boolean } {
  // Look for amount after DESCRIPTION\nDEBITS\nCREDITS\nDESCRIPTION_TEXT\nAMOUNT format
  const newlineMatch = text.match(/DESCRIPTION\s*\n\s*DEBITS\s*\n\s*CREDITS\s*\n[^\n]+\n(\d+\.\d{2})/i);
  if (newlineMatch) {
    return {
      amount: parseFloat(newlineMatch[1]),
      isDebit: true,
    };
  }
  
  // Look for amount in DEBITS column (tab-separated)
  const debitMatch = text.match(/DEBITS[\s\t]+CREDITS[\s\t]*\n[^\n]*[\s\t]+(\d+\.\d{2})/i);
  if (debitMatch) {
    return {
      amount: parseFloat(debitMatch[1]),
      isDebit: true,
    };
  }

  // Look for amount after DEBITS label (tab-separated format)
  const debitTabMatch = text.match(/DEBITS[\s\t]*\n[^\n\t]+[\s\t]+(\d+\.\d{2})/i);
  if (debitTabMatch) {
    return {
      amount: parseFloat(debitTabMatch[1]),
      isDebit: true,
    };
  }

  // Look for standalone DEBITS amount (single column)
  const debitSingleMatch = text.match(/DEBITS[\s\t]*\n(\d+\.\d{2})/i);
  if (debitSingleMatch) {
    return {
      amount: parseFloat(debitSingleMatch[1]),
      isDebit: true,
    };
  }

  // Look for amount in CREDITS column
  const creditMatch = text.match(/CREDITS[\s\t]*\n[^\n]*[\s\t]+(\d+\.\d{2})/i);
  if (creditMatch) {
    return {
      amount: -parseFloat(creditMatch[1]), // Credits are negative
      isDebit: false,
    };
  }

  // Try NET BALANCE with multi-line format (DUE NVL / DUE ACCOUNT)
  const balanceMultiMatch = text.match(/NET\s+BALANCE\s*\n\s*DUE\s+[^\n]+\n\s*DUE\s+[^\n]+\n(\d+\.\d{2})/i);
  if (balanceMultiMatch) {
    return {
      amount: parseFloat(balanceMultiMatch[1]),
      isDebit: true,
    };
  }

  // Try simple NET BALANCE format
  const balanceMatch = text.match(/NET\s+BALANCE[\s\t]*\n?[\s\t]*(\d+\.\d{2})/i);
  if (balanceMatch) {
    return {
      amount: parseFloat(balanceMatch[1]),
      isDebit: true,
    };
  }

  return { amount: 0, isDebit: true };
}

/**
 * Extract reference number (unit number or payment info)
 * Pattern: Numbers after "UNIT #" or in payment line
 */
function extractReference(text: string): string | undefined {
  // Try unit number
  const unitMatch = text.match(/UNIT\s*#[\s\t]*\n?[\s\t]*(\d+)/i);
  if (unitMatch && unitMatch[1] !== '0000') {
    return unitMatch[1];
  }

  // Try payment reference (e.g., "PAYMENT 46 OF 47")
  const paymentMatch = text.match(/PAYMENT[\s\t]+(\d+)[\s\t]+OF[\s\t]+(\d+)/i);
  if (paymentMatch) {
    return `${paymentMatch[1]} OF ${paymentMatch[2]}`;
  }

  // Try long reference number (e.g., "112147005360")
  const longRefMatch = text.match(/(\d{10,})/);
  if (longRefMatch) {
    return longRefMatch[1];
  }

  return undefined;
}

/**
 * Parse CREDIT_DEBIT document using regex patterns
 * Handles both Ollama and Gemini OCR output formats
 */
export function parseCreditDebit(ocrText: string): CreditDebitParseResult {
  const errors: string[] = [];
  const lines: CreditDebitLine[] = [];

  try {
    // Normalize text to handle format variations between OCR providers
    const normalizedText = normalizeOcrText(ocrText, 'gemini');
    
    const transactionType = extractTransactionType(normalizedText);
    const description = extractDescription(normalizedText);
    const entryDate = extractEntryDate(normalizedText);
    const processDate = extractProcessDate(normalizedText);
    const accountNumber = extractAccountNumber(normalizedText);
    const { amount, isDebit } = extractAmountAndType(normalizedText);
    const reference = extractReference(normalizedText);

    // Validate that we extracted essential fields
    if (amount === 0) {
      errors.push('Could not extract amount from credit/debit document');
    }

    const line: CreditDebitLine = {
      transactionType,
      description,
      amount,
      isDebit,
      entryDate,
      processDate,
      accountNumber,
      reference,
      rawText: ocrText,
    };

    lines.push(line);
  } catch (error) {
    errors.push(`Parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { lines, errors };
}
