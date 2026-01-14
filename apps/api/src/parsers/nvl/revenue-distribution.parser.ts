/**
 * AI-based parser for REVENUE_DISTRIBUTION document type
 * 
 * These pages contain detailed trip information with driver assignments,
 * origin/destination, service breakdowns, and net earnings calculations.
 * 
 * Example structure (Page 12-13):
 * - Driver name: BIDETTI, DONNY
 * - Trip number: 1854
 * - B/L: 356985
 * - Route: WESTBOROUGH MA → AKRON OH
 * - Service items: HAULER, FUEL, ATC, etc. with amounts and percentages
 * - Net balance: 3,890.63
 */

import { loadConfig } from '@settleflow/shared-config';

export interface RevenueDistributionLine {
  driverName?: string;
  driverFirstName?: string;
  driverLastName?: string;
  accountNumber?: string;
  tripNumber?: string;
  billOfLading?: string;
  shipperName?: string;
  entryDate?: string;
  origin?: string;
  destination?: string;
  deliveryDate?: string;
  weight?: number;
  miles?: number;
  overflowWeight?: number;
  serviceItems: Array<{
    description: string;
    amount: number;
    percentage?: number;
    earnings?: number;
  }>;
  netBalance: number;
  rawText: string;
}

export interface RevenueDistributionParseResult {
  lines: RevenueDistributionLine[];
  errors: string[];
}

/**
 * Parse driver name into first and last name
 * Examples: "BIDETTI, DONNY" → {first: "DONNY", last: "BIDETTI"}
 */
function parseDriverName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.split(',').map(p => p.trim());
  if (parts.length === 2) {
    return {
      lastName: parts[0],
      firstName: parts[1],
    };
  }
  // Try space-separated
  const spaceParts = fullName.split(/\s+/);
  if (spaceParts.length >= 2) {
    return {
      firstName: spaceParts[0],
      lastName: spaceParts.slice(1).join(' '),
    };
  }
  return { lastName: fullName };
}

/**
 * Use Ollama to extract structured data from REVENUE_DISTRIBUTION document
 */
async function parseWithAI(ocrText: string, serverUrl: string, model: string): Promise<any> {
  const prompt = `Extract the following information from this revenue distribution document and return ONLY valid JSON (no markdown, no explanations):

{
  "driverName": "full driver name as shown (usually after 'Service Performed By')",
  "accountNumber": "account number",
  "tripNumber": "trip number",
  "billOfLading": "B/L number or bill of lading number",
  "shipperName": "shipper name",
  "entryDate": "entry date in YYYY-MM-DD format",
  "origin": "origin city and state",
  "destination": "destination city and state", 
  "deliveryDate": "delivery date in YYYY-MM-DD format (may be shown as MM DD Y format like '11 19 5' for 11/19/2025)",
  "weight": number (total weight in pounds),
  "miles": number (total miles),
  "overflowWeight": number (overflow weight if shown),
  "serviceItems": [
    {
      "description": "service name from Service Performed column",
      "amount": number (from Revenue/Expense or Charges column),
      "percentage": number (from % Due column if shown),
      "earnings": number (from Earnings column)
    }
  ],
  "netBalance": number (final net amount due)
}

IMPORTANT:
- Delivery dates may be in format 'MM DD Y' like '11 19 5' which means 11/19/2025 (20YY format)
- Service Performed By usually contains agent/driver separated by '/'

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
        temperature: 0.1, // Low temperature for more consistent parsing
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const result = await response.json();
  
  // Extract JSON from response (model might wrap it in markdown)
  let jsonText = result.response.trim();
  
  // Remove markdown code blocks if present
  jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  // Find JSON object
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Parse REVENUE_DISTRIBUTION document using AI
 */
export async function parseRevenueDistribution(
  ocrText: string
): Promise<RevenueDistributionParseResult> {
  const errors: string[] = [];
  const lines: RevenueDistributionLine[] = [];
  const config = loadConfig();

  if (!config.ocr.enabled) {
    errors.push('OCR service is not enabled');
    return { lines, errors };
  }

  try {
    const parsed = await parseWithAI(ocrText, config.ocr.serverUrl, config.ocr.model);

    // Parse driver name
    const { firstName, lastName } = parsed.driverName
      ? parseDriverName(parsed.driverName)
      : {};

    // Extract B/L - may be in format "356985/357175" where second number is supplier
    let billOfLading = parsed.billOfLading?.toString();
    if (billOfLading && billOfLading.includes('/')) {
      billOfLading = billOfLading.split('/')[0].trim();
    }

    const line: RevenueDistributionLine = {
      driverName: parsed.driverName,
      driverFirstName: firstName,
      driverLastName: lastName,
      accountNumber: parsed.accountNumber,
      tripNumber: parsed.tripNumber?.toString(),
      billOfLading,
      shipperName: parsed.shipperName,
      entryDate: parsed.entryDate,
      origin: parsed.origin,
      destination: parsed.destination,
      deliveryDate: parsed.deliveryDate,
      weight: parsed.weight,
      miles: parsed.miles,
      overflowWeight: parsed.overflowWeight,
      serviceItems: parsed.serviceItems || [],
      netBalance: parsed.netBalance || 0,
      rawText: ocrText,
    };

    lines.push(line);
  } catch (error) {
    errors.push(`AI parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { lines, errors };
}
