/**
 * Regex-based parser for REVENUE_DISTRIBUTION document type
 * 
 * These pages contain detailed trip information with driver assignments,
 * origin/destination, service breakdowns, and net earnings calculations.
 * Enhanced with flexible patterns to handle multiple OCR providers (Ollama, Gemini)
 * 
 * Example structure (Pages 12-13):
 * - Driver name: BIDETTI, DONNY
 * - Trip number: 1854
 * - B/L: 356985
 * - Route: WESTBOROUGH MA → AKRON OH
 * - Service items: HAULER, FUEL, ATC, etc. with amounts and percentages
 * - Net balance: 3,890.63
 */

import { normalizeOcrText, OCR_PATTERNS } from '../../utils/ocr-normalizer.js';

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
  // Format 1: "AGENT / LASTNAME,\nFIRSTNAME" (driver name split across lines after slash)
  // Example: "CICEROS' MOVING & ST/ BIDETTI,\nMOVING\nDONNY" (skip intermediate lines)
  let match = text.match(/FOR\s+SERVICE\s+PERFORMED\s+BY\s*\n\s*([^/]+)\/\s*([A-Z]+),\s*\n(?:[^\n]*\n)*?\s*([A-Z]+)(?=\s*\n[&S]|\s*\n\s*SHIPPER|\s*\n\s*BILL)/i);
  if (match) {
    // Make sure the captured name is a first name, not a word like "MOVING"
    const lastName = match[2].trim();
    const potentialFirstName = match[3].trim();
    
    // Filter out common non-name words
    if (!potentialFirstName.match(/^(MOVING|STORAGE|CARE|SERVICE|VAN|LINES)$/i)) {
      return {
        agent: match[1].trim(),
        driver: `${lastName}, ${potentialFirstName}`
      };
    }
  }
  
  // Format 2: "AGENT / DRIVER" (complete driver name on one line)
  // Example: "CICEROS' MOVING & ST/ BIDETTI, DONNY"
  match = text.match(/FOR\s+SERVICE\s+PERFORMED\s+BY\s*\n\s*([^/]+)\/\s*([^\n]+)/i);
  if (match) {
    const agent = match[1].trim();
    const driverPart = match[2].trim();
    
    // Check if driver looks complete (has comma for last,first format)
    if (driverPart.includes(',')) {
      return { agent, driver: driverPart };
    }
    
    // Driver might be incomplete, check next line
    const multiLineCheck = text.match(
      new RegExp(`FOR\\s+SERVICE\\s+PERFORMED\\s+BY\\s*\\n\\s*[^/]+\\/\\s*${driverPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s*([A-Z][^\\n]+)`, 'i')
    );
    if (multiLineCheck && multiLineCheck[1]) {
      const nextLine = multiLineCheck[1].trim();
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
 * Handles line breaks and removes leading zeros
 */
function extractAccountNumber(text: string): string | undefined {
  const match = text.match(OCR_PATTERNS.ACCOUNT);
  if (match) {
    return match[1].replace(/^0+/, ''); // Remove leading zeros
  }
  return undefined;
}

/**
 * Extract trip number
 * Pattern: "TRIP" followed by "NUMBER" and the value
 * Also handles "TRIP NUMBER" on same line or "ACCOUNT NUMBER TRIP NUMBER"
 * Handles line breaks and flexible whitespace
 */
function extractTripNumber(text: string): string | undefined {
  // Try table format: "ACCOUNT TRIP\nNUMBER NUMBER\n3101 1854"
  let match = text.match(/ACCOUNT\s+TRIP\s*\n\s*NUMBER\s+NUMBER\s*\n\s*\d+\s+(\d+)/i);
  if (match) {
    return match[1];
  }
  
  // Try "ACCOUNT NUMBER TRIP NUMBER\n3101 416" format
  match = text.match(/TRIP\s+NUMBER\s*\n\s*\d+\s+(\d+)/i);
  if (match) {
    return match[1];
  }
  
  // Use flexible pattern for basic TRIP extraction
  match = text.match(OCR_PATTERNS.TRIP);
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
  // Format 1: After "SHIPPER NAME" header on next line
  // Pattern: "SHIPPER NAME\nTAYLOR" or "SHIPPER NAME\nHANCOCK"
  let match = text.match(/SHIPPER\s+NAME\s*\n\s*([A-ZÀ-ÿ\s'-]+?)\s*(?:\n|$)/i);
  if (match) {
    const name = match[1].trim();
    // Filter out common non-name words and section headers
    if (name && !name.match(/^(TYPE|NVL|NUMBER|ENTITY|INVOICE|COD|TRN|GOV|BILL|LADING|SUPL|DESTINATION|ORIGIN|INTER|REFERENCE|ZIP|WEIGHT|MILES)$/i) && name.length > 1) {
      return name;
    }
  }
  
  // Format 2: "356985/357175 BELLI COD" or "356985/357175\nBELLI"
  match = text.match(/\d{6}\/\d{6}\s*\n?\s*([A-ZÀ-ÿ]+)\s+(?:COD|GOV|TRN|ORIGIN)/i);
  if (match) {
    return match[1].trim();
  }
  
  // Format 3: "357236/\nHARRIS" or "357236/ HARRIS"
  match = text.match(/\d{6}\/\s*\n?\s*([A-ZÀ-ÿ]+)\s+(?:COD|GOV|TRN|ORIGIN)/i);
  if (match) {
    return match[1].trim();
  }
  
  // Format 4: After B/L number (no slash) and before ORIGIN
  // Pattern: "356833\nTAYLOR\nORIGIN"
  match = text.match(/\d{6}\s*\n\s*([A-ZÀ-ÿ\s'-]+?)\s*\n\s*ORIGIN/i);
  if (match) {
    const name = match[1].trim();
    // Filter out common non-name words
    if (name && !name.match(/^(TYPE|NVL|NUMBER|ENTITY|INVOICE|COD|TRN|GOV|BILL|LADING|SUPL|SHIPPER|NAME)$/i)) {
      return name;
    }
  }
  
  return undefined;
}

/**
 * Extract entry date (NVL ENTRY)
 * Pattern: "NVL ENTRY" followed by DATE, then type (COD/GOV), then date value
 * Example: "NVL ENTRY\nDATE\nCOD\n12 01 5"
 */
function extractEntryDate(text: string): string | undefined {
  // Format 1: "NVL ENTRY\nDATE\nCOD\n12 01 5" or "NVL ENTRY\nDATE\nGOV\n11 29 5"
  let match = text.match(/NVL\s+ENTRY\s*\n\s*DATE\s*\n\s*(?:COD|GOV|TRN)\s*\n\s*([\d\s]+)/i);
  if (match) {
    return parseDate(match[1].trim());
  }
  
  // Format 2: Original format "NVL ENTRY\n...\n123456" (6-digit date)
  match = text.match(/NVL\s+ENTRY\s*\n[^\n]*\n(\d{6})/i);
  if (match) {
    return parseDate(match[1]);
  }
  
  // Format 3: "NVL ENTRY\nDATE\n12 01 5" (without type)
  match = text.match(/NVL\s+ENTRY\s*\n\s*DATE\s*\n\s*([\d\s]+)/i);
  if (match) {
    return parseDate(match[1].trim());
  }
  
  return undefined;
}

/**
 * Extract origin city and state
 * Pattern: Can be standalone line, or on same line as destination
 * Example 1: "WESTBOROUGH MA"
 * Example 2: "MISSOURI C TX GERMANTOWN MD" (extract first city+state)
 * Example 3: "ORIGIN\nARNOLD\nZIP...\nMO" (city right after ORIGIN, state comes later)
 */
function extractOrigin(text: string): string | undefined {
  // Split into lines and find the origin line
  const lines = text.split('\n');
  const originIdx = lines.findIndex(l => l.trim().startsWith('ORIGIN'));
  
  if (originIdx >= 0) {
    let city: string | undefined;
    let state: string | undefined;
    
    // Look in the next 15 lines for origin data (state might come after ZIP)
    for (let i = originIdx + 1; i < Math.min(originIdx + 15, lines.length); i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Stop if we hit destination or shipper sections
      if (line.match(/^(DESTINATION|SHIPPER)/i)) break;
      
      // Check if this is a state code (comes after ZIP usually)
      if (!state && line.match(/^(MA|MD|OH|TX|CA|NY|FL|IL|PA|NJ|VA|NC|SC|GA|AL|MS|LA|AR|TN|KY|WV|MI|IN|WI|MN|IA|MO|ND|SD|NE|KS|OK|MT|WY|CO|NM|AZ|UT|NV|ID|WA|OR|AK|HI|ME|NH|VT|RI|CT|DE|DC)$/)) {
        state = line;
        if (city) {
          return `${city}, ${state}`;
        }
        continue;
      }
      
      // Check if this is a city (comes right after ORIGIN, before ZIP)
      if (!city && line.match(/^[A-Z][A-Z\s]+$/) && !line.match(/^(ZIP|INTER|REFERENCE|DESTINATION|WEIGHT|MILES|SIT|PAY|SHIPPER|NAME)/i)) {
        city = line;
        if (state) {
          return `${city}, ${state}`;
        }
        continue;
      }
      
      // Format: "CITY ST" on same line
      const cityState = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})$/);
      if (cityState && cityState[2].match(/^(MA|MD|OH|TX|CA|NY|FL|IL|PA|NJ|VA|NC|SC|GA|AL|MS|LA|AR|TN|KY|WV|MI|IN|WI|MN|IA|MO|ND|SD|NE|KS|OK|MT|WY|CO|NM|AZ|UT|NV|ID|WA|OR|AK|HI|ME|NH|VT|RI|CT|DE|DC)$/)) {
        return `${cityState[1].trim()}, ${cityState[2]}`;
      }
      
      // Format: Both origin and destination on same line
      const sameLineWithDate = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+\d/);
      if (sameLineWithDate) {
        return `${sameLineWithDate[1].trim()}, ${sameLineWithDate[2]}`;
      }
      
      const sameLine = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})$/);
      if (sameLine) {
        return `${sameLine[1].trim()}, ${sameLine[2]}`;
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
 * Example 3: "PRESCOTT V AZ" (city and state on same line with space before state)
 */
function extractDestination(text: string): string | undefined {
  // Split into lines
  const lines = text.split('\n');
  
  // Look for DESTINATION header specifically
  const destIdx = lines.findIndex(l => l.trim().startsWith('DESTINATION'));
  
  if (destIdx >= 0) {
    // Look in the next several lines after DESTINATION header
    for (let i = destIdx + 1; i < Math.min(destIdx + 10, lines.length); i++) {
      const line = lines[i].trim();
      if (!line || line.length < 2) continue;
      
      // Skip non-city lines (ZIP, WEIGHT, etc.)
      if (line.match(/^(ZIP|WEIGHT|MILES|SIT|PAY|INTER)/i)) continue;
      
      // Format 1: "PRESCOTT V AZ" (city with abbreviated word and state on same line)
      const cityStateMatch = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})$/);
      if (cityStateMatch && cityStateMatch[2].match(/^(MA|MD|OH|TX|CA|NY|FL|IL|PA|NJ|VA|NC|SC|GA|AL|MS|LA|AR|TN|KY|WV|MI|IN|WI|MN|IA|MO|ND|SD|NE|KS|OK|MT|WY|CO|NM|AZ|UT|NV|ID|WA|OR|AK|HI|ME|NH|VT|RI|CT|DE|DC)$/)) {
        return `${cityStateMatch[1].trim()}, ${cityStateMatch[2]}`;
      }
      
      // Format 2: City name alone - check if this looks like a city name (all caps letters/spaces)
      if (line.match(/^[A-Z\s]+$/)) {
        // Look for state in next several lines (may be after ZIP, WEIGHT, MILES)
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const stateLine = lines[j].trim();
          // Check if this is a 2-letter state code
          if (stateLine.match(/^(MA|MD|OH|TX|CA|NY|FL|IL|PA|NJ|VA|NC|SC|GA|AL|MS|LA|AR|TN|KY|WV|MI|IN|WI|MN|IA|MO|ND|SD|NE|KS|OK|MT|WY|CO|NM|AZ|UT|NV|ID|WA|OR|AK|HI|ME|NH|VT|RI|CT|DE|DC)$/)) {
            return `${line}, ${stateLine}`;
          }
        }
      }
    }
  }
  
  // Fallback: Look in ORIGIN section for combined format
  const originIdx = lines.findIndex(l => l.trim().startsWith('ORIGIN'));
  if (originIdx >= 0) {
    for (let i = originIdx + 1; i < Math.min(originIdx + 10, lines.length); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Check if origin and destination are on the same line with date
      const sameLineWithDate = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+\d/);
      if (sameLineWithDate) {
        return `${sameLineWithDate[3].trim()}, ${sameLineWithDate[4]}`;
      }
      
      // Check if origin and destination are on the same line without date
      const sameLine = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})$/);
      if (sameLine) {
        return `${sameLine[3].trim()}, ${sameLine[4]}`;
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
  // Format 1: Look for "DELIVERY\nDATE" followed by date with P-code
  // Pattern: "11 19 5 P68" or "12 12 5 P62" 
  let match = text.match(/DELIVERY\s*\n\s*DATE\s*[\s\S]{0,100}?([\d\s]+)\s+P\d+/i);
  if (match) {
    // Extract actual date components - handle formats like "12 125" or "11 19 5"
    const dateStr = match[1].trim();
    // Try standard "MM DD Y" format first
    let dateMatch = dateStr.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{1})/);
    if (dateMatch) {
      return parseDate(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`);
    }
    // Try malformed "MM DDY" format (missing space) like "12 125"
    dateMatch = dateStr.match(/(\d{1,2})\s+(\d)(\d{2})/);
    if (dateMatch) {
      return parseDate(`${dateMatch[1]} ${dateMatch[2]}${dateMatch[3][0]} ${dateMatch[3][1]}`);
    }
  }
  
  // Format 2: Look for date in CUT*RATE section ("11 19 5 P68")
  // Pattern: "CUT*\nRATE\nBILLING\nRATE\nTARIFF\n12 1 5 P62"
  match = text.match(/CUT\*[\s\S]{0,100}?TARIFF\s*\n\s*([\d\s]+)\s+P\d+/i);
  if (match) {
    const dateStr = match[1].trim();
    const dateMatch = dateStr.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{1})/);
    if (dateMatch) {
      return parseDate(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`);
    }
  }
  
  // Format 2b: Simpler CUT*\nRATE\ndate pattern (fallback)
  match = text.match(/CUT\*\s*\n\s*RATE\s*\n([\d\s]+)\s+P\d+/i);
  if (match) {
    const dateStr = match[1].trim();
    const dateMatch = dateStr.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{1})/);
    if (dateMatch) {
      return parseDate(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`);
    }
  }
  
  // Format 3: "MM.DD Y" format (dot separator)
  const dotMatch = text.match(/ORIGIN[^\n]*\n[\s\S]*?([A-Z]{2})\s*\n?(\d{1,2})\.(\d{1,2})\s+(\d{1})/i);
  if (dotMatch) {
    return parseDate(`${dotMatch[2]} ${dotMatch[3]} ${dotMatch[4]}`);
  }
  
  // Format 4: "MM DD Y" on line with origin/destination
  const originSectionMatch = text.match(/ORIGIN[^\n]*\n[^\n]*\n([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1})/);
  if (originSectionMatch) {
    return parseDate(`${originSectionMatch[5]} ${originSectionMatch[6]} ${originSectionMatch[7]}`);
  }
  
  // Format 5: DELIVERY DATE header format
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
 * Handles both Ollama and Gemini OCR output formats
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
    // Normalize text to handle format variations between OCR providers
    const normalizedText = normalizeOcrText(ocrText, 'gemini');
    
    const servicePerformedBy = extractServicePerformedBy(normalizedText);
    const driverName = extractDriverName(servicePerformedBy);
    const { firstName, lastName } = driverName ? parseDriverName(driverName) : {};
    
    const accountNumber = extractAccountNumber(normalizedText);
    const tripNumber = extractTripNumber(normalizedText);
    
    // Extract B/L - may be in format "356985/357175" where second number is supplier
    let billOfLading = extractBillOfLading(normalizedText);
    if (billOfLading && billOfLading.includes('/')) {
      billOfLading = billOfLading.split('/')[0].trim();
    }
    
    const shipperName = extractShipperName(normalizedText);
    const entryDate = extractEntryDate(normalizedText);
    const origin = extractOrigin(normalizedText);
    const destination = extractDestination(normalizedText);
    const deliveryDate = extractDeliveryDate(normalizedText);
    const weight = extractWeight(normalizedText);
    const miles = extractMiles(normalizedText);
    const overflowWeight = extractOverflowWeight(normalizedText);
    const serviceItems = extractServiceItems(normalizedText);
    const netBalance = extractNetBalance(normalizedText);

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
