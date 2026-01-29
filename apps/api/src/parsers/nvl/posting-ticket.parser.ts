/**
 * Regex-based parser for POSTING_TICKET document type
 *
 * Posting tickets are deduction documents for miscellaneous charges
 */
import { normalizeOcrText, detectOcrProvider } from '../../utils/ocr-normalizer.js';
import { POSTING_TICKET_DEBIT_SECTION_SPAN } from '../constants.js';
import { parseSlashDate } from '../utils/date-parser.js';
import {
  parseSignedCurrency,
  CURRENCY_AMOUNT_PATTERN,
  removeLeadingZeros,
} from '../utils/string-utils.js';

export interface PostingTicketLine {
  ptNumber?: string;
  accountNumber?: string;
  debitAmount: number;
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
 * Extract debit amount from document
 */
function extractDebitAmount(text: string): number | undefined {
  const pattern = new RegExp(
    `DEBIT[\\s\\S]{0,${POSTING_TICKET_DEBIT_SECTION_SPAN}}?(${CURRENCY_AMOUNT_PATTERN}-?)`,
    'i'
  );
  const match = text.match(pattern);
  return match ? parseSignedCurrency(match[1]) : undefined;
}

/**
 * Extract description from document
 */
function extractDescription(text: string): string {
  const match = text.match(/(?:OTHER\s+CHARGES|DESCRIPTION\s*\n([^\n]+))/i);
  return match ? (match[1]?.trim() ?? DEFAULT_DESCRIPTION) : DEFAULT_DESCRIPTION;
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
    const debitAmount = extractDebitAmount(text);
    const description = extractDescription(text);
    const date = extractDate(text);

    if (debitAmount === undefined) {
      errors.push('Could not extract debit amount from posting ticket');
      return { lines, errors };
    }

    lines.push({
      ptNumber,
      accountNumber,
      debitAmount,
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
