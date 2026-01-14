/**
 * AI-based parser for CREDIT_DEBIT document type
 * 
 * These are form-based documents showing individual charges or credits
 * 
 * Example structure (Pages 6-10):
 * - Transaction type: SAFETY CHARGEBACKS, PROFILE SEO, ELD SRVC FEE
 * - Description: MOTOR VEH REP, PROFILE SEO, ELD SRVC FEE
 * - Amount: Debit or Credit
 * - Date: Entry date and process date
 * - Account info
 */

import { loadConfig } from '@settleflow/shared-config';

/**
 * Parse date string to valid Date or null
 * Handles: YYYY-MM-DD, MM/DD/YY, MMDDYY formats
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  
  const cleanStr = dateStr.trim();
  
  // Try MMDDYY format (6 digits, no separators) - e.g., 121625 = 12/16/25
  const compactMatch = cleanStr.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, month, day, year] = compactMatch;
    const fullYear = parseInt(`20${year}`, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    // Create date in local timezone to avoid UTC offset issues
    const date = new Date(fullYear, monthNum - 1, dayNum);
    if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
      return date;
    }
  }
  
  // Try YYYY-MM-DD format
  const isoMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const date = new Date(yearNum, monthNum - 1, dayNum);
    // Check if valid date and year is reasonable (1900-2100)
    if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
      return date;
    }
  }
  
  // Try MM/DD/YY format
  const slashMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const fullYear = parseInt(`20${year}`, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const date = new Date(fullYear, monthNum - 1, dayNum);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
}

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
 * Use Ollama to extract structured data from CREDIT_DEBIT document
 */
async function parseWithAI(ocrText: string, serverUrl: string, model: string): Promise<any> {
  const prompt = `Extract the following information from this credit/debit notification document and return ONLY valid JSON (no markdown, no explanations):

{
  "transactionType": "transaction type (e.g., SAFETY CHARGEBACKS, PROFILE SEO)",
  "description": "item description",
  "amount": number (positive number),
  "isDebit": boolean (true if debit/charge, false if credit),
  "entryDate": "entry date (keep as-is, e.g., 121625 for MMDDYY format)",
  "processDate": "process date (keep as-is, e.g., 121625 for MMDDYY format)",
  "accountNumber": "account number if shown",
  "reference": "any reference number or unit number"
}

IMPORTANT: For dates shown as 6 digits like 121625, return them exactly as shown. Do NOT convert to other formats.

Document text:
${ocrText}

Return ONLY the JSON object, no other text.`;

  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const result = await response.json();
  
  // Extract JSON from response
  let jsonText = result.response.trim();
  jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Parse CREDIT_DEBIT document using AI
 */
export async function parseCreditDebit(
  ocrText: string
): Promise<CreditDebitParseResult> {
  const errors: string[] = [];
  const lines: CreditDebitLine[] = [];
  const config = loadConfig();

  if (!config.ocr.enabled) {
    errors.push('OCR service is not enabled');
    return { lines, errors };
  }

  try {
    const parsed = await parseWithAI(ocrText, config.ocr.serverUrl, config.ocr.model);

    // Parse dates safely
    const entryDate = parseDate(parsed.entryDate);
    const processDate = parseDate(parsed.processDate);

    const line: CreditDebitLine = {
      transactionType: parsed.transactionType,
      description: parsed.description || 'Unknown',
      amount: parsed.isDebit ? parsed.amount : -parsed.amount, // Store debits as positive, credits as negative
      isDebit: parsed.isDebit !== false, // Default to debit if not specified
      entryDate: entryDate?.toISOString().split('T')[0],
      processDate: processDate?.toISOString().split('T')[0],
      accountNumber: parsed.accountNumber,
      reference: parsed.reference,
      rawText: ocrText,
    };

    lines.push(line);
  } catch (error) {
    errors.push(`AI parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { lines, errors };
}
