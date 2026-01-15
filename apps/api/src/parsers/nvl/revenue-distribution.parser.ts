/**
 * Regex-based parser for REVENUE_DISTRIBUTION document type
 * 
 * These pages contain detailed trip information with driver assignments,
 * origin/destination, service breakdowns, and net earnings calculations.
 * 
 * Example structure (Pages 12-13):
 * - Driver name: BIDETTI, DONNY
 * - Trip number: 1854
 * - B/L: 356985
 * - Route: WESTBOROUGH MA → AKRON OH
 * - Service items: HAULER, FUEL, ATC, etc. with amounts and percentages
 * - Net balance: 3,890.63
 */

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
 * Parse date in various formats to ISO string
 * Handles: MM DD Y (11 19 5), MM/DD/YY, MMDDYY
 */
function parseDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;

  const cleanStr = dateStr.trim();

  // Try "MM DD Y" format (e.g., "11 19 5" = 11/19/2025)
  const spacedMatch = cleanStr.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{1})$/);
  if (spacedMatch) {
    const [, month, day, year] = spacedMatch;
    const fullYear = `202${year}`;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try MMDDYY format (121625)
  const compactMatch = cleanStr.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, month, day, year] = compactMatch;
    const fullYear = `20${year}`;
    return `${fullYear}-${month}-${day}`;
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
 * Extract service performed by (agent/driver)
 * Pattern: "FOR SERVICE PERFORMED BY" followed by names separated by /
 */
function extractServicePerformedBy(text: string): string | undefined {
  const match = text.match(/FOR\s+SERVICE\s+PERFORMED\s+BY\s*\n([^\n]+)/i);
  if (match) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Extract driver name from service performed by line
 * Pattern: "AGENT / DRIVER" format
 */
function extractDriverName(servicePerformedBy: string | undefined): string | undefined {
  if (!servicePerformedBy) return undefined;

  // Split by / to separate agent and driver
  const parts = servicePerformedBy.split('/').map(p => p.trim());
  if (parts.length >= 2) {
    return parts[1]; // Driver is after the /
  }

  return servicePerformedBy;
}

/**
 * Extract account number
 * Pattern: "ACCOUNT" followed by "NUMBER" and the value
 */
function extractAccountNumber(text: string): string | undefined {
  const match = text.match(/ACCOUNT\s*\n?\s*NUMBER\s*\n?\s*(\d+)/i);
  if (match) {
    return match[1];
  }
  return undefined;
}

/**
 * Extract trip number
 * Pattern: "TRIP" followed by "NUMBER" and the value
 */
function extractTripNumber(text: string): string | undefined {
  const match = text.match(/TRIP\s*\n?\s*NUMBER\s*\n?\s*(\d+)/i);
  if (match) {
    return match[1];
  }
  return undefined;
}

/**
 * Extract bill of lading
 * Pattern: "BILL OF LADING" followed by supplier number
 * Format: 356985/357175 (we only want 356985)
 */
function extractBillOfLading(text: string): string | undefined {
  const match = text.match(/BILL\s+OF\s+LADING\s*\n[^\n]*\n[^\n]*\n[^\n]*\n(\d+)/i);
  if (match) {
    let bol = match[1];
    // Remove supplier number if present
    if (bol.includes('/')) {
      bol = bol.split('/')[0].trim();
    }
    return bol;
  }
  return undefined;
}

/**
 * Extract shipper name
 * Pattern: "SHIPPER NAME" followed by the name
 */
function extractShipperName(text: string): string | undefined {
  const match = text.match(/SHIPPER\s+NAME\s*\n[^\n]*\n([A-Z\s]+)/i);
  if (match) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Extract entry date (NVL ENTRY)
 * Pattern: "NVL ENTRY" followed by date
 */
function extractEntryDate(text: string): string | undefined {
  const match = text.match(/NVL\s+ENTRY\s*\n[^\n]*\n(\d+)/i);
  if (match) {
    return parseDate(match[1]);
  }
  return undefined;
}

/**
 * Extract origin city and state
 * Pattern: "ORIGIN" followed by city and state
 */
function extractOrigin(text: string): string | undefined {
  const match = text.match(/ORIGIN\s*\n[^\n]*\n([A-Z\s]+)\s+([A-Z]{2})/i);
  if (match) {
    return `${match[1].trim()}, ${match[2]}`;
  }
  return undefined;
}

/**
 * Extract destination city and state
 * Pattern: "DESTINATION" followed by city and state
 */
function extractDestination(text: string): string | undefined {
  const match = text.match(/DESTINATION\s*\n[^\n]*\n([A-Z\s]+)\s+([A-Z]{2})/i);
  if (match) {
    return `${match[1].trim()}, ${match[2]}`;
  }
  return undefined;
}

/**
 * Extract delivery date
 * Pattern: "DELIVERY" followed by "DATE" and date in "MM DD Y" format
 */
function extractDeliveryDate(text: string): string | undefined {
  const match = text.match(/DELIVERY\s*\n?DATE\s*\n(\d+\s+\d+\s+\d+)/i);
  if (match) {
    return parseDate(match[1]);
  }
  return undefined;
}

/**
 * Extract weight
 * Pattern: Weight in pounds (may have / separator)
 */
function extractWeight(text: string): number | undefined {
  const match = text.match(/(\d+)\/?\s*\n?\s*(\d+)\s+BILLING/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Extract miles
 * Pattern: Miles value after weight
 */
function extractMiles(text: string): number | undefined {
  const match = text.match(/MILES\s*\n[^\n]*\n(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Extract overflow weight
 * Pattern: Number after / in weight field
 */
function extractOverflowWeight(text: string): number | undefined {
  const match = text.match(/(\d+)\/(\d+)\s*\n?\s*\d+\s+BILLING/i);
  if (match && match[2]) {
    return parseInt(match[2], 10);
  }
  return undefined;
}

/**
 * Extract service items from the revenue breakdown section
 * Pattern: Service lines with description, revenue, percentage, charges, earnings
 */
function extractServiceItems(text: string): Array<{
  description: string;
  amount: number;
  percentage?: number;
  earnings?: number;
}> {
  const items: Array<{
    description: string;
    amount: number;
    percentage?: number;
    earnings?: number;
  }> = [];

  // Look for service item lines between REVENUE/EXPENSE header and NET BALANCE
  const serviceSection = text.match(/REVENUE\/\s*\n?EXPENSE.*?\n(.*?)NET\s+BALANCE/is);
  if (!serviceSection) return items;

  const lines = serviceSection[1].split('\n');
  
  for (const line of lines) {
    // Match pattern: SERVICE_NAME  AMOUNT  PERCENTAGE  CHARGES/EARNINGS
    // Examples:
    // HAULER    4639.54    62.5    2,899.95
    // ATC       417.30     8.0     33.38
    const match = line.match(/^([A-Z\s]+?)\s+(\d+(?:,\d+)*\.\d{2})\s+(\d+\.\d+)\s+(\d+(?:,\d+)*\.\d{2})/);
    
    if (match) {
      const description = match[1].trim();
      const amount = parseFloat(match[2].replace(/,/g, ''));
      const percentage = parseFloat(match[3]);
      const earnings = parseFloat(match[4].replace(/,/g, ''));

      items.push({
        description,
        amount,
        percentage,
        earnings,
      });
    }
  }

  return items;
}

/**
 * Extract net balance
 * Pattern: "NET BALANCE" followed by "DUE" and amount
 */
function extractNetBalance(text: string): number {
  const match = text.match(/NET\s+BALANCE\s*\n?\s*DUE\s+(?:NVL|ACCOUNT)\s*\n?[\s\w]*?\n?(\d+(?:,\d+)*\.\d{2})/i);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  return 0;
}

/**
 * Parse REVENUE_DISTRIBUTION document using regex patterns
 */
export function parseRevenueDistribution(ocrText: string): RevenueDistributionParseResult {
  const errors: string[] = [];
  const lines: RevenueDistributionLine[] = [];

  try {
    const servicePerformedBy = extractServicePerformedBy(ocrText);
    const driverName = extractDriverName(servicePerformedBy);
    const { firstName, lastName } = driverName ? parseDriverName(driverName) : {};
    
    const accountNumber = extractAccountNumber(ocrText);
    const tripNumber = extractTripNumber(ocrText);
    
    // Extract B/L - may be in format "356985/357175" where second number is supplier
    let billOfLading = extractBillOfLading(ocrText);
    if (billOfLading && billOfLading.includes('/')) {
      billOfLading = billOfLading.split('/')[0].trim();
    }
    
    const shipperName = extractShipperName(ocrText);
    const entryDate = extractEntryDate(ocrText);
    const origin = extractOrigin(ocrText);
    const destination = extractDestination(ocrText);
    const deliveryDate = extractDeliveryDate(ocrText);
    const weight = extractWeight(ocrText);
    const miles = extractMiles(ocrText);
    const overflowWeight = extractOverflowWeight(ocrText);
    const serviceItems = extractServiceItems(ocrText);
    const netBalance = extractNetBalance(ocrText);

    // Validate essential fields
    if (!tripNumber) {
      errors.push('Could not extract trip number from revenue distribution');
    }
    if (netBalance === 0) {
      errors.push('Could not extract net balance from revenue distribution');
    }

    const line: RevenueDistributionLine = {
      driverName,
      driverFirstName: firstName,
      driverLastName: lastName,
      accountNumber,
      tripNumber,
      billOfLading,
      shipperName,
      entryDate,
      origin,
      destination,
      deliveryDate,
      weight,
      miles,
      overflowWeight,
      serviceItems,
      netBalance,
      rawText: ocrText,
    };

    lines.push(line);
  } catch (error) {
    errors.push(`Parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { lines, errors };
}
