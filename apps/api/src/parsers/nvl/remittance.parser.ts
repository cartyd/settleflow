/**
 * AI-based parser for REMITTANCE document type
 * 
 * This is the cover page with check/payment information
 * 
 * Example structure (Page 1):
 * - Check number: 590668
 * - Check date: 12/18/25
 * - Check amount: $3,330.53
 * - Payee: CICEROS' MOVING & STORAGE LLC
 * - Bank account: 5590034319
 * - Payment method: Electronic transfer
 */

import { loadConfig } from '@settleflow/shared-config';

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
}

/**
 * Use Ollama to extract structured data from REMITTANCE document
 */
async function parseWithAI(ocrText: string, serverUrl: string, model: string): Promise<any> {
  const prompt = `Extract the following information from this remittance advice document and return ONLY valid JSON (no markdown, no explanations):

{
  "checkNumber": "check number or payment reference",
  "checkDate": "check date in YYYY-MM-DD format",
  "checkAmount": number (dollar amount),
  "payeeName": "payee/recipient name",
  "payeeAddress": "payee address",
  "bankAccount": "bank account number if shown",
  "paymentMethod": "payment method (e.g., check, ACH, electronic transfer)",
  "accountNumber": "account number",
  "reference": "any additional reference information"
}

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
 * Parse REMITTANCE document using AI
 */
export async function parseRemittance(
  ocrText: string
): Promise<RemittanceParseResult> {
  const errors: string[] = [];
  const lines: RemittanceLine[] = [];
  const config = loadConfig();

  if (!config.ocr.enabled) {
    errors.push('OCR service is not enabled');
    return { lines, errors };
  }

  try {
    const parsed = await parseWithAI(ocrText, config.ocr.serverUrl, config.ocr.model);

    const line: RemittanceLine = {
      checkNumber: parsed.checkNumber,
      checkDate: parsed.checkDate,
      checkAmount: parsed.checkAmount,
      payeeName: parsed.payeeName,
      payeeAddress: parsed.payeeAddress,
      bankAccount: parsed.bankAccount,
      paymentMethod: parsed.paymentMethod,
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
