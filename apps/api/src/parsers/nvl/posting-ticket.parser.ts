/**
 * Regex-based parser for POSTING_TICKET document type
 *
 * Posting tickets can be either revenue (CREDIT column - toll reimbursements)
 * or deductions (DEBIT column - miscellaneous charges)
 */
import { normalizeOcrText, detectOcrProvider } from '../../utils/ocr-normalizer.js';
import { POSTING_TICKET_DEBIT_SECTION_SPAN } from '../constants.js';
import { parseSlashDate } from '../utils/date-parser.js';
import {
  parseSignedCurrency,
  parseCurrency,
  CURRENCY_AMOUNT_PATTERN,
  removeLeadingZeros,
} from '../utils/string-utils.js';

export interface PostingTicketLine {
  ptNumber?: string;
  accountNumber?: string;
  amount: number; // Positive for credits (revenue), negative for debits (charges)
  isCredit: boolean; // True for credits (revenue), false for debits (charges)
  description?: string;
  date?: string;
  rawText: string;
}

export interface PostingTicketParseResult {
  lines: PostingTicketLine[];
  errors: string[];
}

// Default description for posting tickets
const DEFAULT_DESCRIPTION = 'OTHER CHARGES';

/**
 * Extract PT number from document
 */
function extractPTNumber(text: string): string | undefined {
  const match = text.match(/PT\s+NUMBER\s*\n?\s*(\d+)/i);
  return match?.[1];
}

/**
 * Extract account number from document (removes leading zeros)
 */
function extractAccountNumber(text: string): string | undefined {
  const match = text.match(/ACCOUNT\s*\n?NUMBER\s*\n?\s*(\d+)/i);
  return match ? removeLeadingZeros(match[1]) : undefined;
}

/**
 * Extract the net total from the bottom of the posting ticket
 * This is the most reliable source for the posting ticket amount
 */
function extractTotalAmount(text: string): { amount: number; isCredit: boolean } | undefined {
  // Look for TOTAL: label followed by description and amount
  // Format: "TOTAL:\nTOLLS\nTOLLS REIMBURSEMENT FOR TRIP 1854\nPT 1 OF 1\n253.17\n253.17"
  // The amount appears on its own line after PT X OF X
  
  // Look for the pattern after TOTAL: and PT X OF X
  // The amount should be on its own line (preceded by newline, not part of TRIP XXXX)
  const totalPattern = /TOTAL:[\s\S]+?PT\s+\d+\s+OF\s+\d+[\s\n]+([\d,]+\.\d{2})/i;
  const match = text.match(totalPattern);
  
  if (!match) {
    // Fallback: look for amount on a line by itself after TOTAL:
    const fallbackPattern = /TOTAL:[\s\S]+?\n([\d,]+\.\d{2})\s*\n/i;
    const fallbackMatch = text.match(fallbackPattern);
    if (!fallbackMatch) return undefined;
    
    const amount = parseCurrency(fallbackMatch[1]);
    const beforeTotal = text.substring(0, text.indexOf('TOTAL:'));
    const creditCheck = new RegExp(
      `CREDIT[\\s\\S]{0,200}?${fallbackMatch[1].replace(/[,.]/g, '\\$&')}`,
      'i'
    );
    const hasCredit = creditCheck.test(beforeTotal);
    
    return { amount, isCredit: hasCredit };
  }
  
  const amount = parseCurrency(match[1]);
  
  // Determine if this is a credit or debit by checking which column has an amount
  // Look backwards from TOTAL: to see if CREDIT or DEBIT column has values
  const beforeTotal = text.substring(0, text.indexOf('TOTAL:'));
  
  // Check if CREDIT column has the amount (appears after CREDIT header)
  const creditCheck = new RegExp(
    `CREDIT[\\s\\S]{0,200}?${match[1].replace(/[,.]/g, '\\$&')}`,
    'i'
  );
  const hasCredit = creditCheck.test(beforeTotal);
  
  return {
    amount,
    isCredit: hasCredit,
  };
}

/**
 * Extract description from document
 * Handles formats like:
 * - "TOLLS REIMBURSEMENT FOR TRIP 1854"
 * - "OTHER CHARGES"
 * - Lines after TOTAL: label
 */
function extractDescription(text: string): string {
  // Look for description after TOTAL: label (most reliable)
  const totalMatch = text.match(/TOTAL:\s*\n?\s*([^\n]+)/i);
  if (totalMatch && totalMatch[1].trim()) {
    return totalMatch[1].trim();
  }
  
  // Look for common patterns like "TOLLS REIMBURSEMENT FOR TRIP XXXX"
  const tollsMatch = text.match(/(TOLLS[^\n]+)/i);
  if (tollsMatch) {
    return tollsMatch[1].trim();
  }
  
  // Look for OTHER CHARGES
  const chargesMatch = text.match(/OTHER\s+CHARGES/i);
  if (chargesMatch) {
    return 'OTHER CHARGES';
  }
  
  // Look for DESCRIPTION label
  const descMatch = text.match(/DESCRIPTION\s*\n([^\n]+)/i);
  if (descMatch && descMatch[1].trim()) {
    return descMatch[1].trim();
  }
  
  return DEFAULT_DESCRIPTION;
}

/**
 * Extract date from document (format MM/DD/YY at top)
 */
function extractDate(text: string): string | undefined {
  const match = text.match(/^(\d{1,2}\/\d{1,2}\/\d{2})/m);
  return parseSlashDate(match?.[1]);
}

/**
 * Parse POSTING_TICKET document using regex patterns
 */
export function parsePostingTicket(ocrText: string): PostingTicketParseResult {
  const errors: string[] = [];
  const lines: PostingTicketLine[] = [];

  try {
    // Default to Gemini if provider cannot be detected from text patterns
    const provider = detectOcrProvider(ocrText) ?? 'gemini';
    const text = normalizeOcrText(ocrText, provider);

    const ptNumber = extractPTNumber(text);
    const accountNumber = extractAccountNumber(text);
    const description = extractDescription(text);
    const date = extractDate(text);
    
    // Extract the total amount from the bottom summary
    const totalResult = extractTotalAmount(text);
    
    if (!totalResult) {
      errors.push('Could not extract total amount from posting ticket');
      return { lines, errors };
    }
    
    // Set amount sign based on whether it's a credit or debit
    const amount = totalResult.isCredit ? totalResult.amount : -totalResult.amount;
    const isCredit = totalResult.isCredit;

    lines.push({
      ptNumber,
      accountNumber,
      amount,
      isCredit,
      description,
      date,
      rawText: ocrText,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Error parsing posting ticket: ${errorMessage}`);
  }

  return { lines, errors };
}
