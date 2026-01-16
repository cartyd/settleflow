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
 * Pattern: "FOR SERVICE PERFORMED BY" followed by agent/driver names
 * Can be:
 * 1. Single line with /: "AGENT / DRIVER"
 * 2. Multi-line with incomplete name: "AGENT / PARTIAL\nDRIVER"
 * Returns {agent, driver} tuple
 */
function extractServicePerformedBy(text: string): { agent?: string; driver?: string } {
  // Try single line format first: "AGENT / DRIVER" all on one line
  // Example: "CICEROS' MOVING & ST/ BIDETTI, DONNY"
  const singleLineMatch = text.match(/FOR\s+SERVICE\s+PERFORMED\s+BY\s*\n\s*([^/]+)\/\s*([^\n]+)/i);
  if (singleLineMatch) {
    const agent = singleLineMatch[1].trim();
    const driverPart = singleLineMatch[2].trim();
    
    // Check if driver looks complete (has comma for last,first format)
    if (driverPart.includes(',')) {
      return { agent, driver: driverPart };
    }
    
    // Driver might be incomplete, check next line
    // Look for the driver part followed by next non-empty line
    const multiLineCheck = text.match(
      new RegExp(`FOR\\s+SERVICE\\s+PERFORMED\\s+BY\\s*\\n\\s*[^/]+\\/\\s*${driverPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s*([A-Z][^\\n]+)`, 'i')
    );
    if (multiLineCheck && multiLineCheck[1]) {
      const nextLine = multiLineCheck[1].trim();
      // Only use next line if it looks like a name (has comma for Last, First format)
      // AND doesn't look like a header (ACCOUNT, NUMBER, etc.)
      if (nextLine.includes(',') && !nextLine.includes('NUMBER') && !nextLine.includes('ACCOUNT')) {
        return { agent, driver: nextLine };
      }
    }
    
    return { agent, driver: driverPart };
  }
  
  return {};
}

/**
 * Extract driver name from service performed by result
 */
function extractDriverName(servicePerformedBy: { agent?: string; driver?: string }): string | undefined {
  return servicePerformedBy.driver;
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
 * Also handles "TRIP NUMBER" on same line or "ACCOUNT NUMBER TRIP NUMBER"
 */
function extractTripNumber(text: string): string | undefined {
  // Try "ACCOUNT NUMBER TRIP NUMBER\n3101 416" format
  let match = text.match(/TRIP\s+NUMBER\s*\n\s*\d+\s+(\d+)/i);
  if (match) {
    return match[1];
  }
  
  // Try "TRIP\nNUMBER\n1854" format
  match = text.match(/TRIP\s*\n?\s*NUMBER\s*\n?\s*(\d+)/i);
  if (match) {
    return match[1];
  }
  return undefined;
}

/**
 * Extract bill of lading
 * Pattern: "BILL OF LADING" followed by supplier number (format: 356985/357175)
 * We extract the first number before the slash
 */
function extractBillOfLading(text: string): string | undefined {
  // Look for pattern like "356985/357175" or just "356985" after BILL OF LADING section
  const match = text.match(/BILL\s+OF\s+LADING[\s\S]{0,200}?(\d{6})\s*\/\s*\d{6}/i);
  if (match) {
    return match[1];
  }
  
  // Fallback: try to find just a 6-digit number in the BOL section
  const simpleMatch = text.match(/BILL\s+OF\s+LADING[\s\S]{0,200}?(\d{6})/i);
  if (simpleMatch) {
    return simpleMatch[1];
  }
  
  return undefined;
}

/**
 * Extract shipper name
 * Pattern: "SHIPPER NAME" followed by the name
 * May appear with or without forward slash
 */
function extractShipperName(text: string): string | undefined {
  // Look for shipper name after bill of lading section
  // Format can be: "357236/ HARRITS" or just the name
  const match = text.match(/\d{6}\/\s*([A-ZÀ-ÿ]+)\s+(?:COD|TRN)/i);
  if (match) {
    return match[1].trim();
  }
  
  // Fallback: Look for name after SHIPPER NAME header
  const headerMatch = text.match(/SHIPPER\s+NAME[\s\S]{0,100}?\n([A-ZÀ-ÿ\s']+)\s*\n+(?:ORIGIN|COD)/i);
  if (headerMatch) {
    const name = headerMatch[1].trim();
    if (name && !name.match(/^(TYPE|NVL|NUMBER|ENTITY|INVOICE|COD|TRN)$/i)) {
      return name;
    }
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
 * Pattern: Can be standalone line, or on same line as destination
 * Example 1: "WESTBOROUGH MA"
 * Example 2: "MISSOURI C TX GERMANTOWN MD" (extract first city+state)
 */
function extractOrigin(text: string): string | undefined {
  // Split into lines and find the origin line
  // Header might be "ORIGIN" alone or "ORIGIN DESTINATION..."  
  const lines = text.split('\n');
  const originIdx = lines.findIndex(l => l.trim().startsWith('ORIGIN'));
  
  if (originIdx >= 0) {
    // Look in the next 10 lines for origin data
    for (let i = originIdx + 1; i < Math.min(originIdx + 10, lines.length); i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Check if both origin and destination are on the same line with date
      // Pattern: "CITY ST CITY ST DD DD D..." or "CITY C ST CITY ST DD DD D..."
      const sameLineWithDate = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+\d/);
      if (sameLineWithDate) {
        return `${sameLineWithDate[1].trim()} ${sameLineWithDate[2]}`;
      }
      
      // Check if both origin and destination are on the same line without date
      // Pattern: "CITY ST CITY ST" or "CITY C ST CITY ST"
      const sameLine = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})$/);
      if (sameLine) {
        return `${sameLine[1].trim()} ${sameLine[2]}`;
      }
      
      // Otherwise match standalone "CITY ST" line
      const standalone = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})$/);
      if (standalone && standalone[2].length === 2) {
        return `${standalone[1].trim()} ${standalone[2]}`;
      }
    }
  }
  
  return undefined;
}

/**
 * Extract destination city and state
 * Pattern: Can be on same line as origin, or on separate lines
 * Example 1: "MISSOURI C TX GERMANTOWN MD" (both on same line)
 * Example 2: Line "AKRON" followed by line "OH" (separate lines)
 */
function extractDestination(text: string): string | undefined {
  // Split into lines
  const lines = text.split('\n');
  const originIdx = lines.findIndex(l => l.trim().startsWith('ORIGIN'));
  
  if (originIdx >= 0) {
    // Find the origin city+state line first
    let originLineIdx = -1;
    for (let i = originIdx + 1; i < Math.min(originIdx + 10, lines.length); i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Check if origin and destination are on the same line with date
      // Pattern: "CITY ST CITY ST DD DD D..." or "CITY C ST CITY ST DD DD D..."
      const sameLineWithDate = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+\d/);
      if (sameLineWithDate) {
        return `${sameLineWithDate[3].trim()}, ${sameLineWithDate[4]}`;
      }
      
      // Check if origin and destination are on the same line without date
      // Pattern: "CITY ST CITY ST" or "CITY C ST CITY ST"
      const sameLine = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})$/);
      if (sameLine) {
        return `${sameLine[3].trim()}, ${sameLine[4]}`;
      }
      
      // Otherwise, look for origin line
      if (line.match(/^[A-Z][A-Z\s]+\s+[A-Z]{2}$/)) {
        originLineIdx = i;
        break;
      }
    }
    
    // If origin and destination are on separate lines
    if (originLineIdx >= 0) {
      // Look for next city name (all caps, might be multiple words)
      for (let i = originLineIdx + 1; i < Math.min(originLineIdx + 5, lines.length); i++) {
        const city = lines[i].trim();
        if (!city || city.length < 2) continue;
        
        // Check if this looks like a city name (all caps)
        if (city.match(/^[A-Z\s]+$/)) {
          // Next line should be state abbreviation
          if (i + 1 < lines.length) {
            const state = lines[i + 1].trim();
            if (state.match(/^[A-Z]{2}$/)) {
              return `${city}, ${state}`;
            }
          }
        }
      }
    }
  }
  
  return undefined;
}

/**
 * Extract delivery date
 * Pattern: Date can be "11.19 5", "11 19 5", or "12 12 5"
 * Must appear after origin/destination info to avoid picking up wrong date
 */
function extractDeliveryDate(text: string): string | undefined {
  // Try "MM.DD Y" format (dot separator) - appears after ORIGIN section
  const dotMatch = text.match(/ORIGIN[^\n]*\n[\s\S]*?([A-Z]{2})\s*\n?(\d{1,2})\.(\d{1,2})\s+(\d{1})/i);
  if (dotMatch) {
    const month = dotMatch[2];
    const day = dotMatch[3];
    const year = dotMatch[4];
    return parseDate(`${month} ${day} ${year}`);
  }
  
  // Try "MM DD Y" format on line with origin/destination
  // Look for pattern after "ORIGIN" header: "CITY ST CITY ST DD DD Y"
  const originSectionMatch = text.match(/ORIGIN[^\n]*\n[^\n]*\n([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1})/);
  if (originSectionMatch) {
    const month = originSectionMatch[5];
    const day = originSectionMatch[6];
    const year = originSectionMatch[7];
    return parseDate(`${month} ${day} ${year}`);
  }
  
  // Try "MM DD Y" format (space separator, after state abbreviation)
  // But NOT after "COD" which appears earlier in the document
  const spaceMatch = text.match(/ORIGIN[^\n]*\n[^\n]*\n[^\n]*([A-Z]{2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1})\s+/i);
  if (spaceMatch) {
    const month = spaceMatch[2];
    const day = spaceMatch[3];
    const year = spaceMatch[4];
    return parseDate(`${month} ${day} ${year}`);
  }
  
  // Fallback: DELIVERY DATE header format
  const headerMatch = text.match(/DELIVERY\s*\n?DATE\s*\n(\d+\s+\d+\s+\d+)/i);
  if (headerMatch) {
    return parseDate(headerMatch[1]);
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
 * Pattern: "NET BALANCE" followed by amount (may have DUE NVL or just the amount)
 * Handles multiple formats:
 * - Single line: "NET BALANCE DUE N/V.L 3890.63"
 * - Multi-line: "NET BALANCE DUE NVL\n*RATES...\n314.83\nDUE ACCOUNT"
 */
function extractNetBalance(text: string): number {
  // Try simplest format first: "NET BALANCE 314.83" (single line, no DUE)
  let match = text.match(/NET\s+BALANCE\s+(\d+(?:,\d+)*\.\d{2})/i);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  
  // Try single-line format with DUE: "NET BALANCE DUE NVL 3890.63"
  match = text.match(/NET\s+BALANCE\s+DUE\s+(?:N[.\/]?V[.\/]?L[.\/]?|ACCOUNT)\s+(\d+(?:,\d+)*\.\d{2})/i);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  
  // Try format where amount appears after "NET BALANCE DUE NVL" with content in between
  // Example: "NET BALANCE DUE NVL\n*RATES...\n314.83\nDUE ACCOUNT"
  match = text.match(/NET\s+BALANCE[\s\S]{0,500}?^\s*(\d+(?:,\d+)*\.\d{2})\s*$/m);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  
  // Try "NET BALANCE\nDUE NVL\n3,890.63" format (multi-line, direct)
  match = text.match(/NET\s+BALANCE\s*\n\s*DUE\s+(?:N\.?V\.?L\.?|ACCOUNT)\s*\n(\d+(?:,\d+)*\.\d{2})/i);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  
  // Try simple "NET BALANCE\n3,890.63" format
  match = text.match(/NET\s+BALANCE\s*\n(\d+(?:,\d+)*\.\d{2})/i);
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

  // Handle empty input
  if (!ocrText || ocrText.trim().length === 0) {
    errors.push('Empty document provided');
    return { lines, errors };
  }

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
