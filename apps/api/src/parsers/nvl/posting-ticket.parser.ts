/**
 * Regex-based parser for POSTING_TICKET document type
 * 
 * Posting tickets are deduction documents for miscellaneous charges
 */
import { normalizeOcrText, detectOcrProvider } from '../../utils/ocr-normalizer.js';
import { POSTING_TICKET_DEBIT_SECTION_SPAN } from '../constants.js';
import { parseSlashDate } from '../utils/date-parser.js';

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


/**
 * Parse POSTING_TICKET document using regex patterns
 */
export function parsePostingTicket(ocrText: string): PostingTicketParseResult {
  const errors: string[] = [];
  const lines: PostingTicketLine[] = [];

  try {
    const provider = detectOcrProvider(ocrText) ?? 'gemini';
    const text = normalizeOcrText(ocrText, provider);
    
    // Extract PT number
    const ptMatch = text.match(/PT\s+NUMBER\s*\n?\s*(\d+)/i);
    const ptNumber = ptMatch ? ptMatch[1] : undefined;

    // Extract account number
    const accountMatch = text.match(/ACCOUNT\s*\n?NUMBER\s*\n?\s*(\d+)/i);
    const accountNumber = accountMatch ? accountMatch[1] : undefined;

    // Extract debit amount
    // Format: "DEBIT\nCICEROS' MOVING & ST\t3101\t10.00"
    // The debit amount appears after the account number on the same line
    // Look for decimal amount (xx.xx) after "DEBIT" header
    const debitMatch = text.match(new RegExp(`DEBIT[\\s\\S]{0,${POSTING_TICKET_DEBIT_SECTION_SPAN}}?(\\d{1,3}(?:,\\d{3})*\\.\\d{2}-?)`, 'i'));
    if (!debitMatch) {
      errors.push('Could not extract debit amount from posting ticket');
      return { lines, errors };
    }
    const rawAmt = debitMatch[1];
    const isTrailingMinus = rawAmt.endsWith('-');
    const debitAmount = parseFloat(rawAmt.replace(/,/g, '').replace(/-$/, '')) * (isTrailingMinus ? -1 : 1);

    // Extract description (look for common patterns like "OTHER CHARGES")
    const descMatch = text.match(/OTHER\s+CHARGES|DESCRIPTION\s*\n([^\n]+)/i);
    const description = descMatch ? descMatch[0].trim() : 'OTHER CHARGES';

    // Extract date (at top of document, format MM/DD/YY)
    const dateMatch = text.match(/^(\d{1,2}\/\d{1,2}\/\d{2})/m);
    const date = parseSlashDate(dateMatch ? dateMatch[1] : undefined);

    lines.push({
      ptNumber,
      accountNumber,
      debitAmount,
      description,
      date,
      rawText: ocrText,
    });

  } catch (error) {
    errors.push(`Error parsing posting ticket: ${error}`);
  }

  return { lines, errors };
}
