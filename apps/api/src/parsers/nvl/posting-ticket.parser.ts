/**
 * Regex-based parser for POSTING_TICKET document type
 * 
 * Posting tickets are deduction documents for miscellaneous charges
 */

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
 * Parse date in MM/DD/YY format to ISO string
 */
function parseDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) {
    const [, month, day, year] = match;
    const fullYear = `20${year}`;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return undefined;
}

/**
 * Parse POSTING_TICKET document using regex patterns
 */
export function parsePostingTicket(ocrText: string): PostingTicketParseResult {
  const errors: string[] = [];
  const lines: PostingTicketLine[] = [];

  try {
    // Extract PT number
    const ptMatch = ocrText.match(/PT\s+NUMBER\s*\n?\s*(\d+)/i);
    const ptNumber = ptMatch ? ptMatch[1] : undefined;

    // Extract account number
    const accountMatch = ocrText.match(/ACCOUNT\s*\n?NUMBER\s*\n?\s*(\d+)/i);
    const accountNumber = accountMatch ? accountMatch[1] : undefined;

    // Extract debit amount
    // Format: "DEBIT\nCICEROS' MOVING & ST\t3101\t10.00"
    // The debit amount appears after the account number on the same line
    // Look for decimal amount (xx.xx) after "DEBIT" header
    const debitMatch = ocrText.match(/DEBIT[\s\S]{0,200}?(\d+\.\d{2})/i);
    if (!debitMatch) {
      errors.push('Could not extract debit amount from posting ticket');
      return { lines, errors };
    }
    
    const debitAmount = parseFloat(debitMatch[1]);

    // Extract description (look for common patterns like "OTHER CHARGES")
    const descMatch = ocrText.match(/OTHER\s+CHARGES|DESCRIPTION\s*\n([^\n]+)/i);
    const description = descMatch ? descMatch[0].trim() : 'OTHER CHARGES';

    // Extract date (at top of document, format MM/DD/YY)
    const dateMatch = ocrText.match(/^(\d{1,2}\/\d{1,2}\/\d{2})/m);
    const date = parseDate(dateMatch ? dateMatch[1] : undefined);

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
