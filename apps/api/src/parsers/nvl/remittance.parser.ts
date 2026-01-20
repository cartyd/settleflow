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

export interface RemittanceLine {
  checkNumber?: string;
  checkDate?: string;
  checkAmount?: number;
  payeeName?: string;
  payeeAddress?: string;
  bankAccount?: string;
  paymentMethod?: string;
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
 * Parse date string in MM/DD/YY format to ISO date string
 * Example: 12/18/25 -> 2025-12-18
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
  for (let i = 0; i < Math.min(10, lines.length); i++) {
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
    return parseDate(dateMatch[1]);
  }

  // Try date in "PAY TO THE ORDER OF" line
  const payMatch = text.match(/PAY TO THE ORDER OF.*?DATE\s+(\d{1,2}\/\d{1,2}\/\d{2})/i);
  if (payMatch) {
    return parseDate(payMatch[1]);
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
 * Pattern: Name line after "PAY TO THE ORDER OF"
 */
function extractPayeeName(text: string): string | undefined {
  // Look for payee name after "PAY TO THE ORDER OF"
  const payMatch = text.match(/PAY TO THE ORDER OF[^\n]*\n\s*([^\n]+)/i);
  if (payMatch) {
    return payMatch[1].trim();
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
function extractPaymentMethod(text: string): string | undefined {
  if (text.match(/ELECTRONICALLY\s+TRANSFERRED/i)) {
    return 'Electronic Transfer';
  }

  if (text.match(/NON-NEGOTIABLE/i)) {
    return 'Check';
  }

  return undefined;
}

/**
 * Extract account number from the document
 * Pattern: Account number in the account table or "ACCOUNT XXXX"
 */
function extractAccountNumber(text: string): string | undefined {
  // Try account table format
  const tableMatch = text.match(/ACCOUNT\s+NUMBER.*?\n.*?(\d+)\s+[0-9,]+\.\d{2}/is);
  if (tableMatch) {
    return tableMatch[1];
  }

  // Try simple "ACCOUNT XXXX" pattern
  const accountMatch = text.match(/ACCOUNT\s+(\d+)/i);
  if (accountMatch) {
    return accountMatch[1];
  }

  return undefined;
}

/**
 * Calculate week start and end dates from check date
 * Assumes settlement is for the week ending ~1 week before check date
 */
function calculateWeekDates(checkDate: string): { weekStartDate: string; weekEndDate: string } | undefined {
  try {
    const check = new Date(checkDate);
    // Settlement is typically for week ending 7-14 days before check
    // We'll use 7 days before check as the week end
    const weekEnd = new Date(check);
    weekEnd.setDate(weekEnd.getDate() - 7);
    
    // Week starts 6 days before week end (Sunday to Saturday)
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    
    return {
      weekStartDate: weekStart.toISOString().split('T')[0],
      weekEndDate: weekEnd.toISOString().split('T')[0],
    };
  } catch {
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
    const checkNumber = extractCheckNumber(ocrText);
    const checkDate = extractCheckDate(ocrText);
    const checkAmount = extractCheckAmount(ocrText);
    const payeeName = extractPayeeName(ocrText);
    const payeeAddress = extractPayeeAddress(ocrText);
    const bankAccount = extractBankAccount(ocrText);
    const paymentMethod = extractPaymentMethod(ocrText);
    const accountNumber = extractAccountNumber(ocrText);

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
    console.log('[REMITTANCE PARSER] Extracted fields:', {
      checkNumber,
      accountNumber,
      checkDate,
      payeeName,
    });
    
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
      
      console.log('[REMITTANCE PARSER] Created metadata successfully');
    } else {
      console.log('[REMITTANCE PARSER] Missing required fields for metadata');
    }
  } catch (error) {
    errors.push(`Parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { lines, errors, metadata };
}
