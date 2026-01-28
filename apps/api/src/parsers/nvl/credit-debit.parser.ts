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

import { normalizeOcrText, OCR_PATTERNS, detectOcrProvider } from '../../utils/ocr-normalizer.js';
import { NET_BALANCE_SECTION_SPAN } from '../constants.js';
import { parseDate } from '../utils/date-parser.js';
import { removeLeadingZeros, parseCurrency } from '../utils/string-utils.js';

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

// Minimum length for a valid description
const MIN_DESCRIPTION_LENGTH = 3;

// Keywords to exclude from descriptions (headers, common words, etc.)
const EXCLUDED_DESCRIPTION_KEYWORDS = /^(NVL|ENTRY|DATE|PROCESS|ACCOUNT|NUMBER|UNIT|AGENT|DRIVER|NAME|FOR|ANY|DISCREPANCIES|FOLLOWING|DEPARTMENTS|LEASE|CONVENTION|WATTS|PAYMENTS|PLEASE|CONTACT|THE|ACCOUNTING|DEPARTMENT|YELLOW|PAGES|AGENCY|BOND|TRAILER|EMERGENCY|FUNDING|SETTLEMENT|INQUIRES|SAFTEY|NET|BALANCE|DUE|DEBITS|CREDITS|N\.V\.L\.|#)$/i;

// Pattern for valid description text (all caps with spaces)
const VALID_DESCRIPTION_PATTERN = /^[A-Z][A-Z\s]+$/;


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
 * Check if a line is a valid description
 */
function isValidDescription(line: string): boolean {
  const trimmed = line.trim();
  
  // Skip empty lines
  if (!trimmed) return false;
  
  // Skip if it's just numbers or dates
  if (trimmed.match(/^\d+$/)) return false;
  
  // Skip common header words and fragments
  if (trimmed.match(EXCLUDED_DESCRIPTION_KEYWORDS)) return false;
  
  // Skip sentence fragments (lines that end with common prepositions or conjunctions)
  if (trimmed.match(/(contact|please|or|and|for|the|to|of)$/i)) return false;
  
  // Only include lines that look like actual item descriptions
  return trimmed.length >= MIN_DESCRIPTION_LENGTH && VALID_DESCRIPTION_PATTERN.test(trimmed);
}

/**
 * Try extracting descriptions from main section between DESCRIPTION header and footer
 */
function tryDescriptionSection(text: string): string[] {
  const descriptions: string[] = [];
  const sectionMatch = text.match(/DESCRIPTION[\s\t]*\n([\s\S]*?)(?:AGENT\/DRIVER\s+NAME|NVL\s+ENTRY|FOR\s+ANY\s+DISCREPANCIES)/i);
  
  if (sectionMatch) {
    const sectionText = sectionMatch[1].trim();
    const lines = sectionText.split('\n');
    
    for (const line of lines) {
      if (isValidDescription(line)) {
        descriptions.push(line.trim());
      }
    }
  }
  
  return descriptions;
}

/**
 * Try extracting description from tab-separated format
 */
function tryTabSeparatedDescription(text: string): string | undefined {
  const match = text.match(/DESCRIPTION[\s\t]+DEBITS[\s\t]+CREDITS[\s\t]*\n([^\t\n]+)[\s\t]+\d+\.\d{2}/i);
  return match?.[1]?.trim();
}

/**
 * Try extracting description from minimal format: DESCRIPTION then single line before DEBITS/CREDITS
 */
function tryMinimalDescription(text: string): string | undefined {
  const match = text.match(/DESCRIPTION[\s\t]*\n\s*([^\n]+)\s*\n\s*(?:DEBITS|CREDITS)/i);
  return match?.[1]?.trim();
}

/**
 * Extract descriptions from the document
 * Pattern: Multiple lines after "DESCRIPTION" header before DEBITS/CREDITS
 * Returns array of descriptions (one document can have multiple line items)
 * Only returns descriptions that appear to be valid item names (not headers, dates, numbers, etc.)
 */
function extractDescriptions(text: string): string[] {
  // Try main section extraction
  let descriptions = tryDescriptionSection(text);
  if (descriptions.length > 0) return descriptions;
  
  // Try tab-separated format
  const tabDesc = tryTabSeparatedDescription(text);
  if (tabDesc) return [tabDesc];
  
  // Try minimal format
  const minimalDesc = tryMinimalDescription(text);
  if (minimalDesc) return [minimalDesc];
  
  // Fallback: use transaction type if available
  const transType = extractTransactionType(text);
  if (transType) return [transType];
  
  return [];
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

  // Try PROCESS DATE with slash format MM/DD/YY
  match = text.match(/PROCESS\s+DATE[\s\t]*\n?[\s\t]*(\d{1,2}\/\d{1,2}\/\d{2})/i);
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
  return match ? removeLeadingZeros(match[1]) : undefined;
}

/**
 * Extract amounts and determine if debit or credit
 * Pattern: Amounts in DEBITS or CREDITS column
 * Returns array of amounts (one document can have multiple line items)
 */
function extractAmountsAndTypes(text: string): Array<{ amount: number; isDebit: boolean }> {
  const results: Array<{ amount: number; isDebit: boolean }> = [];
  
  // Find all amounts in DEBITS column after the DEBITS header
  const debitSection = text.match(/DEBITS[\s\t]+CREDITS[\s\t]*\n([\s\S]*?)(?:NET\s+BALANCE|DUE|FOR\s+ANY|$)/i);
  if (debitSection) {
    const sectionText = debitSection[1];
    // Match all decimal numbers that look like amounts
    const amountMatches = sectionText.matchAll(/(\d+\.\d{2})/g);
    
    for (const match of amountMatches) {
      const amount = parseCurrency(match[1]);
      // Check if this might be a credit by looking at context
      // For now, assume amounts in the DEBITS section are debits
      results.push({ amount, isDebit: true });
    }
  }
  
  // If no amounts found, try the old single-amount extraction
  if (results.length === 0) {
    const singleResult = extractSingleAmountAndType(text);
    if (singleResult.amount > 0) {
      results.push(singleResult);
    }
  }
  
  return results;
}

/**
 * Try extracting amount from newline format: DESCRIPTION\nDEBITS\nCREDITS\nTEXT\nAMOUNT
 */
function tryNewlineFormat(text: string): { amount: number; isDebit: boolean } | undefined {
  const match = text.match(/DESCRIPTION\s*\n\s*DEBITS\s*\n\s*CREDITS\s*\n[^\n]+\n(\d+\.\d{2})/i);
  return match ? { amount: parseCurrency(match[1]), isDebit: true } : undefined;
}

/**
 * Try extracting amount from DEBITS column (tab-separated)
 */
function tryDebitColumnFormat(text: string): { amount: number; isDebit: boolean } | undefined {
  const match = text.match(/DEBITS[\s\t]+CREDITS[\s\t]*\n[^\n]*[\s\t]+(\d+\.\d{2})/i);
  return match ? { amount: parseCurrency(match[1]), isDebit: true } : undefined;
}

/**
 * Try extracting amount after DEBITS label (tab-separated format)
 */
function tryDebitTabFormat(text: string): { amount: number; isDebit: boolean } | undefined {
  const match = text.match(/DEBITS[\s\t]*\n[^\n\t]+[\s\t]+(\d+\.\d{2})/i);
  return match ? { amount: parseCurrency(match[1]), isDebit: true } : undefined;
}

/**
 * Try extracting standalone DEBITS amount (single column)
 */
function tryDebitSingleFormat(text: string): { amount: number; isDebit: boolean } | undefined {
  const match = text.match(/DEBITS[\s\t]*\n(\d+\.\d{2})/i);
  return match ? { amount: parseCurrency(match[1]), isDebit: true } : undefined;
}

/**
 * Try extracting amount from CREDITS column
 */
function tryCreditFormat(text: string): { amount: number; isDebit: boolean } | undefined {
  const match = text.match(/CREDITS[\s\t]*\n[^\n]*[\s\t]+(\d+\.\d{2})/i);
  return match ? { amount: -parseCurrency(match[1]), isDebit: false } : undefined;
}

/**
 * Try NET BALANCE with multi-line format (DUE NVL / DUE ACCOUNT)
 */
function tryBalanceMultiFormat(text: string): { amount: number; isDebit: boolean } | undefined {
  const match = text.match(/NET\s+BALANCE\s*\n\s*DUE\s+[^\n]+\n\s*DUE\s+[^\n]+\n(-?\d+(?:,\d+)*\.\d{2})/i);
  return match ? { amount: parseCurrency(match[1]), isDebit: true } : undefined;
}

/**
 * Try simple NET BALANCE format
 */
function tryBalanceSimpleFormat(text: string): { amount: number; isDebit: boolean } | undefined {
  const match = text.match(/NET\s+BALANCE[\s\t]*\n?[\s\t]*(-?\d+(?:,\d+)*\.\d{2})/i);
  return match ? { amount: parseCurrency(match[1]), isDebit: true } : undefined;
}

/**
 * Try flexible NET BALANCE within bounded span after header
 */
function tryFlexibleBalanceFormat(text: string): { amount: number; isDebit: boolean } | undefined {
  const pattern = new RegExp(`NET\\s+BALANCE[\\s\\S]{0,${NET_BALANCE_SECTION_SPAN}}?(?:^|\\n)\\s*(-?\\d+(?:,\\d+)*\\.\\d{2})\\s*(?:$|\\n)`, 'mi');
  const match = text.match(pattern);
  return match ? { amount: parseCurrency(match[1]), isDebit: true } : undefined;
}

/**
 * Extract single amount (fallback for old format)
 * Pattern: Amount in DEBITS or CREDITS column
 */
function extractSingleAmountAndType(text: string): { amount: number; isDebit: boolean } {
  // Try extraction strategies in order
  return tryNewlineFormat(text)
    || tryDebitColumnFormat(text)
    || tryDebitTabFormat(text)
    || tryDebitSingleFormat(text)
    || tryCreditFormat(text)
    || tryBalanceMultiFormat(text)
    || tryBalanceSimpleFormat(text)
    || tryFlexibleBalanceFormat(text)
    || { amount: 0, isDebit: true };
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
 * Can extract multiple line items from a single document
 */
export function parseCreditDebit(ocrText: string): CreditDebitParseResult {
  const errors: string[] = [];
  const lines: CreditDebitLine[] = [];

  try {
    // Normalize text to handle format variations between OCR providers
    // Default to Gemini if provider cannot be detected from text patterns
    const provider = detectOcrProvider(ocrText) ?? 'gemini';
    const normalizedText = normalizeOcrText(ocrText, provider);
    
    const transactionType = extractTransactionType(normalizedText);
    const descriptions = extractDescriptions(normalizedText);
    const entryDate = extractEntryDate(normalizedText);
    const processDate = extractProcessDate(normalizedText);
    const accountNumber = extractAccountNumber(normalizedText);
    const amountsAndTypes = extractAmountsAndTypes(normalizedText);
    const reference = extractReference(normalizedText);

    // Match descriptions with amounts (they should be in the same order)
    // Only create line items where we have both a valid description AND a non-zero amount
    const itemCount = Math.min(descriptions.length, amountsAndTypes.length);
    
    if (itemCount === 0) {
      // If we have amounts but no descriptions, try to use transaction type
      if (amountsAndTypes.length > 0 && transactionType) {
        for (const amountInfo of amountsAndTypes) {
          if (amountInfo.amount > 0) {
            lines.push({
              transactionType,
              description: transactionType,
              amount: amountInfo.amount,
              isDebit: amountInfo.isDebit,
              entryDate,
              processDate,
              accountNumber,
              reference,
              rawText: ocrText,
            });
          }
        }
      }
    } else {
      // Create line items for each description/amount pair
      for (let i = 0; i < itemCount; i++) {
        const description = descriptions[i];
        const amountInfo = amountsAndTypes[i];
        
        // Only create a line if we have a non-zero amount
        if (amountInfo.amount > 0) {
          const line: CreditDebitLine = {
            transactionType,
            description,
            amount: amountInfo.amount,
            isDebit: amountInfo.isDebit,
            entryDate,
            processDate,
            accountNumber,
            reference,
            rawText: ocrText,
          };

          lines.push(line);
        }
      }
    }
    
    // If we still have no lines, add an error
    if (lines.length === 0) {
      // If we at least captured a date, create a placeholder line
      if (entryDate || processDate) {
        lines.push({
          transactionType,
          description: descriptions[0] ?? transactionType ?? 'MISC',
          amount: 0,
          isDebit: true,
          entryDate,
          processDate,
          accountNumber,
          reference,
          rawText: ocrText,
        });
      }
      errors.push('Could not extract any valid description/amount pairs from document');
    }
  } catch (error) {
    errors.push(`Parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { lines, errors };
}
