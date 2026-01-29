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

import { normalizeOcrText, OCR_PATTERNS, detectOcrProvider } from '../../utils/ocr-normalizer.js';
import {
  STATE_CODE_CAPTURE,
  STATE_CODE_LINE_RE,
  CITY_LINE_RE,
  ORIGIN_LOOKAHEAD_LINES,
  DEST_LOOKAHEAD_LINES,
  DEST_STATE_LOOKAHEAD_AFTER_CITY,
  BOL_SECTION_SPAN,
  NET_BALANCE_SECTION_SPAN,
  ORIGIN_SECTION_SCAN_CHARS,
  DESTINATION_FALLBACK_LOOKAHEAD,
  DEFAULT_DECADE_BASE,
  CENTURY_BASE,
  PREFERRED_YEAR_MIN,
  PREFERRED_YEAR_MAX,
} from '../constants.js';
import {
  isValidDate as validateDate,
  parseCompactDate,
  parseSlashDate,
} from '../utils/date-parser.js';
import { parseDriverName as parseDriverNameUtil } from '../utils/name-parser.js';
import { parseCurrency } from '../utils/string-utils.js';

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
  netBalance?: number;
  rawText: string;
}

export interface RevenueDistributionParseResult {
  lines: RevenueDistributionLine[];
  errors: string[];
}

// ===== CONSTANTS =====

// Precompiled regex patterns for location parsing (supports diacritics and punctuation)
const CITY_STATE_RE = new RegExp(`^([A-ZÀ-ÿ'\\-\\s]+?)\\s+(${STATE_CODE_CAPTURE})$`, 'i');
const CITY_STATE_WITH_DATE_RE = new RegExp(
  `^([A-ZÀ-ÿ'\\-\\s]+?)\\s+(${STATE_CODE_CAPTURE})\\s+([A-ZÀ-ÿ'\\-\\s]+?)\\s+(${STATE_CODE_CAPTURE})\\s+\\d`,
  'i'
);
const CITY_STATE_PAIR_RE = new RegExp(
  `^([A-ZÀ-ÿ'\\-\\s]+?)\\s+(${STATE_CODE_CAPTURE})\\s+([A-ZÀ-ÿ'\\-\\s]+?)\\s+(${STATE_CODE_CAPTURE})$`,
  'i'
);

// Header keywords to skip when looking for city names
const NON_CITY_KEYWORDS = /^(ZIP|INTER|REFERENCE|DESTINATION|WEIGHT|MILES|SIT|PAY|SHIPPER|NAME)/i;

// Header keywords to skip when looking for destination cities
const NON_DESTINATION_KEYWORDS = /^(ZIP|WEIGHT|MILES|SIT|PAY|INTER)/i;

// Section header keywords that aren't shipper names
const NON_SHIPPER_NAME_KEYWORDS =
  /^(TYPE|NVL|NUMBER|ENTITY|INVOICE|COD|TRN|GOV|BILL|LADING|SUPL|DESTINATION|ORIGIN|INTER|REFERENCE|ZIP|WEIGHT|MILES)$/i;

// Common non-name words after B/L numbers
const NON_SHIPPER_NAME_KEYWORDS_SHORT =
  /^(TYPE|NVL|NUMBER|ENTITY|INVOICE|COD|TRN|GOV|BILL|LADING|SUPL|SHIPPER|NAME)$/i;

/**
 * Parse driver name into first and last name
 * Wrapper around shared utility for backwards compatibility
 * @deprecated Use parseDriverNameUtil from name-parser.ts directly
 */
function parseDriverName(fullName: string): { firstName?: string; lastName?: string } {
  return parseDriverNameUtil(fullName);
}

/**
 * Parse date in various formats to ISO string
 * Handles: MM DD Y (11 19 5), MM/DD/YY, MMDDYY
 * Validates date components before returning
 * Year is interpreted based on decadeBase (deterministic) or current decade (fallback)
 */
function parseDate(
  dateStr: string | undefined,
  opts?: { decadeBase?: number }
): string | undefined {
  if (!dateStr) return undefined;

  const cleanStr = dateStr.trim();

  // Try "MM DD Y" format (e.g., "11 19 5" = 11/19/2025)
  const spacedMatch = cleanStr.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{1})$/);
  if (spacedMatch) {
    const [, month, day, year] = spacedMatch;
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);

    if (!validateDate(monthNum, dayNum)) {
      return undefined; // Invalid date components
    }

    // Compute full year deterministically from provided decadeBase (e.g., 2020 + 5 = 2025)
    const decadeBase = opts?.decadeBase ?? DEFAULT_DECADE_BASE;
    const fullYearNum = decadeBase + parseInt(year, 10);
    return `${fullYearNum}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try MMDDYY format - use shared utility
  const compactResult = parseCompactDate(cleanStr);
  if (compactResult) return compactResult;

  // Try MM/DD/YY format - use shared utility
  const slashResult = parseSlashDate(cleanStr);
  if (slashResult) return slashResult;

  return undefined;
}

/**
 * Detect a decade base from text by finding a YY-bearing date and inferring its decade.
 * Returns the decade base year (e.g., 2020) if found.
 */
function detectDecadeBaseFromText(text: string): number | undefined {
  const yys: number[] = [];
  // Collect all YY from MMDDYY
  for (const m of text.matchAll(/\b(\d{2})(\d{2})(\d{2})\b/g)) {
    const mm = parseInt(m[1], 10);
    const dd = parseInt(m[2], 10);
    const yy = parseInt(m[3], 10);
    if (!Number.isNaN(yy) && validateDate(mm, dd)) yys.push(yy);
  }
  // Collect all YY from MM/DD/YY
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/g)) {
    const mm = parseInt(m[1], 10);
    const dd = parseInt(m[2], 10);
    const yy = parseInt(m[3], 10);
    if (!Number.isNaN(yy) && validateDate(mm, dd)) yys.push(yy);
  }
  if (yys.length === 0) return undefined;
  // Prefer years in 2000-2029 to avoid drifting into 2030s anchors
  const preferred = yys.filter((yy) => yy >= PREFERRED_YEAR_MIN && yy <= PREFERRED_YEAR_MAX);
  const pick = (arr: number[]) => {
    // Choose the mode (most frequent); fall back to min
    const counts = new Map<number, number>();
    for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: number | undefined;
    let bestCount = -1;
    for (const [v, c] of counts) {
      if (c > bestCount || (c === bestCount && (best === undefined || v < best))) {
        best = v;
        bestCount = c;
      }
    }
    return best ?? Math.min(...arr);
  };
  const yy = (preferred.length > 0 ? pick(preferred) : undefined) ?? pick(yys);
  const full = CENTURY_BASE + yy;
  return Math.floor(full / 10) * 10;
}

/**
 * Try to detect a decade base using dates near the ORIGIN/route section,
 * which is more relevant for delivery date than earlier headers like COD.
 */
function detectDecadeBaseAroundOrigin(text: string): number | undefined {
  const originIdx = text.search(/ORIGIN/i);
  if (originIdx >= 0) {
    const endIdx = Math.min(text.length, originIdx + ORIGIN_SECTION_SCAN_CHARS);
    const segment = text.slice(originIdx, endIdx);
    return detectDecadeBaseFromText(segment);
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
  let match = text.match(
    /FOR\s+SERVICE\s+PERFORMED\s+BY\s*\n\s*([^/]+)\/\s*([A-Z]+),\s*\n(?:[^\n]*\n)*?\s*([A-Z]+)(?=\s*\n[&S]|\s*\n\s*SHIPPER|\s*\n\s*BILL)/i
  );
  if (match) {
    // Make sure the captured name is a first name, not a word like "MOVING"
    const lastName = match[2].trim();
    const potentialFirstName = match[3].trim();

    // Filter out common non-name words
    if (!potentialFirstName.match(/^(MOVING|STORAGE|CARE|SERVICE|VAN|LINES)$/i)) {
      return {
        agent: match[1].trim(),
        driver: `${lastName}, ${potentialFirstName}`,
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
      new RegExp(
        `FOR\\s+SERVICE\\s+PERFORMED\\s+BY\\s*\\n\\s*[^/]+\\/\\s*${driverPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s*([A-Z][^\\n]+)`,
        'i'
      )
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
  const match = text.match(
    new RegExp(`BILL\\s+OF\\s+LADING[\\s\\S]{0,${BOL_SECTION_SPAN}}?(\\d{6})\\s*\\/\\s*\\d{6}`, 'i')
  );
  if (match) {
    return match[1];
  }

  // Fallback: try to find just a 6-digit number in the BOL section
  const simpleMatch = text.match(
    new RegExp(`BILL\\s+OF\\s+LADING[\\s\\S]{0,${BOL_SECTION_SPAN}}?(\\d{6})`, 'i')
  );
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
    if (name && !NON_SHIPPER_NAME_KEYWORDS.test(name) && name.length > 1) {
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
    if (name && !NON_SHIPPER_NAME_KEYWORDS_SHORT.test(name)) {
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
function extractEntryDate(text: string, opts?: { decadeBase?: number }): string | undefined {
  // Format 1: "NVL ENTRY\nDATE\nCOD\n12 01 5" or "NVL ENTRY\nDATE\nGOV\n11 29 5"
  let match = text.match(/NVL\s+ENTRY\s*\n\s*DATE\s*\n\s*(?:COD|GOV|TRN)\s*\n\s*([\d\s]+)/i);
  if (match) {
    return parseDate(match[1].trim(), opts);
  }

  // Format 2: Original format "NVL ENTRY\n...\n123456" (6-digit date)
  match = text.match(/NVL\s+ENTRY\s*\n[^\n]*\n(\d{6})/i);
  if (match) {
    return parseDate(match[1], opts);
  }

  // Format 3: "NVL ENTRY\nDATE\n12 01 5" (without type)
  match = text.match(/NVL\s+ENTRY\s*\n\s*DATE\s*\n\s*([\d\s]+)/i);
  if (match) {
    return parseDate(match[1].trim(), opts);
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
  const originIdx = lines.findIndex((l) => l.trim().startsWith('ORIGIN'));

  if (originIdx >= 0) {
    let city: string | undefined;
    let state: string | undefined;

    // Look ahead for origin data (state might come after ZIP)
    for (
      let i = originIdx + 1;
      i < Math.min(originIdx + ORIGIN_LOOKAHEAD_LINES, lines.length);
      i++
    ) {
      const line = lines[i].trim();

      // Skip empty lines
      if (!line) continue;

      // Stop if we hit destination or shipper sections
      if (line.match(/^(DESTINATION|SHIPPER)/i)) break;

      // Check if this is a state code (comes after ZIP usually)
      if (!state && STATE_CODE_LINE_RE.test(line)) {
        state = line;
        if (city) {
          return `${city}, ${state}`;
        }
        continue;
      }

      // Format: "CITY ST" on same line (prefer this before treating as city-only)
      const cityState = line.match(CITY_STATE_RE);
      if (cityState) {
        return `${cityState[1].trim()}, ${cityState[2]}`;
      }

      // Check if this is a city (comes right after ORIGIN, before ZIP)
      if (!city && CITY_LINE_RE.test(line) && !NON_CITY_KEYWORDS.test(line)) {
        city = line;
        if (state) {
          return `${city}, ${state}`;
        }
        continue;
      }

      // Format: Both origin and destination on same line
      const sameLineWithDate = line.match(CITY_STATE_WITH_DATE_RE);
      if (sameLineWithDate) {
        return `${sameLineWithDate[1].trim()}, ${sameLineWithDate[2]}`;
      }

      const sameLine = line.match(CITY_STATE_PAIR_RE);
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
  const destIdx = lines.findIndex((l) => l.trim().startsWith('DESTINATION'));

  if (destIdx >= 0) {
    // Look in the next several lines after DESTINATION header
    for (let i = destIdx + 1; i < Math.min(destIdx + DEST_LOOKAHEAD_LINES, lines.length); i++) {
      const line = lines[i].trim();
      if (!line || line.length < 2) continue;

      // Skip non-city lines (ZIP, WEIGHT, etc.)
      if (NON_DESTINATION_KEYWORDS.test(line)) continue;

      // Format 1: "PRESCOTT V AZ" (city with abbreviated word and state on same line)
      const cityStateMatch = line.match(CITY_STATE_RE);
      if (cityStateMatch) {
        return `${cityStateMatch[1].trim()}, ${cityStateMatch[2]}`;
      }

      // Format 2: City name alone - check if this looks like a city name
      if (CITY_LINE_RE.test(line)) {
        // Look for state in next several lines (may be after ZIP, WEIGHT, MILES)
        for (let j = i + 1; j < Math.min(i + DEST_STATE_LOOKAHEAD_AFTER_CITY, lines.length); j++) {
          const stateLine = lines[j].trim();
          // Check if this is a 2-letter state code
          if (STATE_CODE_LINE_RE.test(stateLine)) {
            return `${line}, ${stateLine}`;
          }
        }
      }
    }
  }

  // Fallback: Look in ORIGIN section for combined format
  const originIdx = lines.findIndex((l) => l.trim().startsWith('ORIGIN'));
  if (originIdx >= 0) {
    for (
      let i = originIdx + 1;
      i < Math.min(originIdx + DESTINATION_FALLBACK_LOOKAHEAD, lines.length);
      i++
    ) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check if origin and destination are on the same line with date
      const sameLineWithDate = line.match(CITY_STATE_WITH_DATE_RE);
      if (sameLineWithDate) {
        return `${sameLineWithDate[3].trim()}, ${sameLineWithDate[4]}`;
      }

      // Check if origin and destination are on the same line without date
      const sameLine = line.match(CITY_STATE_PAIR_RE);
      if (sameLine) {
        return `${sameLine[3].trim()}, ${sameLine[4]}`;
      }
    }
  }

  return undefined;
}

/**
 * Extract delivery date (RDD)
 * Pattern: Date immediately precedes P-code (e.g., P62, P65)
 * Format: "MM DD Y P##" where date comes right before P-code
 * Special handling: OCR may merge day+year ("15" = "1 5")
 */
function extractDeliveryDate(text: string, opts?: { decadeBase?: number }): string | undefined {
  const localDecadeBase = detectDecadeBaseAroundOrigin(text) ?? opts?.decadeBase;
  // Strategy 1: Try standard 4-component pattern "MM DD Y P##"
  // Examples: "11 29 5 P65", "12 01 5 P62"
  let match = text.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{1})\s+P\d{2,3}/i);
  if (match) {
    const month = match[1];
    const day = match[2];
    const year = match[3];

    if (validateDate(parseInt(month), parseInt(day))) {
      return parseDate(`${month} ${day} ${year}`, { decadeBase: localDecadeBase });
    }
  }

  // Strategy 2: Handle OCR error where day+year are merged
  // Pattern: "MM XY P##" where XY is a 2-digit number that should be "X Y"
  // Example: "12 15 P62" should be "12 1 5 P62" (day=1, year=5)
  // This happens when single-digit day (0X) merges with year (Y) → "XY"
  match = text.match(/(\d{1,2})\s*\n?\s*(\d{2})\s+P\d{2,3}/i);
  if (match) {
    const month = match[1];
    const merged = match[2]; // e.g., "15" should be "1" and "5"

    // Split the 2-digit merged value: first digit = day, second digit = year
    const day = merged[0];
    const year = merged[1];

    // Validate: month 1-12, day 1-9 (single digit only for merged case)
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    if (validateDate(monthNum, dayNum) && dayNum <= 9) {
      return parseDate(`${month} ${day} ${year}`, { decadeBase: localDecadeBase });
    }
  }

  // Format 3: "MM.DD Y" format (dot separator)
  const dotMatch = text.match(
    /ORIGIN[^\n]*\n[\s\S]*?([A-Z]{2})\s*\n?(\d{1,2})\.(\d{1,2})\s+(\d{1})/i
  );
  if (dotMatch) {
    return parseDate(`${dotMatch[2]} ${dotMatch[3]} ${dotMatch[4]}`, {
      decadeBase: localDecadeBase,
    });
  }

  // Format 4: "MM DD Y" near ORIGIN section with route on same line
  const originIdx = text.search(/ORIGIN/i);
  if (originIdx >= 0) {
    const endIdx = Math.min(text.length, originIdx + ORIGIN_SECTION_SCAN_CHARS);
    const segment = text.slice(originIdx, endIdx);
    // For route line, accept any two-letter state tokens (OCR may produce placeholders in tests)
    const routeMatch = segment.match(
      new RegExp(
        `([A-ZÀ-ÿ'\\-\\s]+?)\\s+([A-Z]{2})\\s+([A-ZÀ-ÿ'\\-\\s]+?)\\s+([A-Z]{2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1})`,
        'i'
      )
    );
    if (routeMatch) {
      return parseDate(`${routeMatch[5]} ${routeMatch[6]} ${routeMatch[7]}`, {
        decadeBase: localDecadeBase,
      });
    }
  }

  // Format 5: DELIVERY DATE header format
  const headerMatch = text.match(/DELIVERY\s*\n?DATE\s*\n(\d+\s+\d+\s+\d+)/i);
  if (headerMatch) {
    return parseDate(headerMatch[1], { decadeBase: localDecadeBase });
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
    // Flexible pattern: DESCRIPTION  AMOUNT  [PERCENT]  [EARNINGS]
    // Allows negatives and optional percentage/earnings
    const match = line.match(
      /^([A-ZÀ-ÿ&'\-\s]+?)\s+(-?\d[\d,]*\.\d{2})(?:\s+(\d+(?:\.\d+)?))?(?:\s+(-?\d[\d,]*\.\d{2}))?/
    );
    if (match) {
      const description = match[1].trim();
      const amount = parseCurrency(match[2]);
      const percentage = match[3] ? parseFloat(match[3]) : undefined;
      const earnings = match[4] ? parseCurrency(match[4]) : undefined;

      if (!isNaN(amount)) {
        items.push({ description, amount, percentage, earnings });
      }
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
 * Returns undefined if not found (allows distinguishing from actual zero balance)
 */
function extractNetBalance(text: string): number | undefined {
  // Try simplest format first: "NET BALANCE 314.83" (single line, no DUE)
  let match = text.match(/NET\s+BALANCE\s+(-?\d+(?:,\d+)*\.\d{2})/i);
  if (match) {
    return parseCurrency(match[1]);
  }

  // Try single-line format with DUE: "NET BALANCE DUE NVL 3890.63"
  match = text.match(
    /NET\s+BALANCE\s+DUE\s+(?:N[./]?V[./]?L[./]?|ACCOUNT)\s+(-?\d+(?:,\d+)*\.\d{2})/i
  );
  if (match) {
    return parseCurrency(match[1]);
  }

  // Try format where amount appears after "NET BALANCE DUE NVL" with content in between
  // Example: "NET BALANCE DUE NVL\n*RATES...\n314.83\nDUE ACCOUNT"
  match = text.match(
    new RegExp(
      `NET\\s+BALANCE[\\s\\S]{0,${NET_BALANCE_SECTION_SPAN}}?^\\s*(-?\\d+(?:,\\d+)*\\.\\d{2})\\s*$`,
      'mi'
    )
  );
  if (match) {
    return parseCurrency(match[1]);
  }

  // Try "NET BALANCE\nDUE NVL\n3,890.63" format (multi-line, direct)
  match = text.match(
    /NET\s+BALANCE\s*\n\s*DUE\s+(?:N\.?V\.?L\.?|ACCOUNT)\s*\n(-?\d+(?:,\d+)*\.\d{2})/i
  );
  if (match) {
    return parseCurrency(match[1]);
  }

  // Try simple "NET BALANCE\n3,890.63" format
  match = text.match(/NET\s+BALANCE\s*\n(-?\d+(?:,\d+)*\.\d{2})/i);
  if (match) {
    return parseCurrency(match[1]);
  }

  return undefined;
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
    // Normalize text; auto-detect provider to avoid hard-coding
    const provider = detectOcrProvider(ocrText);
    const normalizedText = normalizeOcrText(ocrText, provider);
    const anchoredDecadeBase = detectDecadeBaseFromText(normalizedText) ?? DEFAULT_DECADE_BASE;

    const servicePerformedBy = extractServicePerformedBy(normalizedText);
    const driverName = servicePerformedBy.driver;
    const { firstName, lastName } = driverName ? parseDriverName(driverName) : {};

    const accountNumber = extractAccountNumber(normalizedText);
    const tripNumber = extractTripNumber(normalizedText);

    // Extract B/L
    const billOfLading = extractBillOfLading(normalizedText);

    const shipperName = extractShipperName(normalizedText);
    const entryDate = extractEntryDate(normalizedText, { decadeBase: anchoredDecadeBase });
    const origin = extractOrigin(normalizedText);
    const destination = extractDestination(normalizedText);
    const deliveryDate = extractDeliveryDate(normalizedText, { decadeBase: anchoredDecadeBase });
    const weight = extractWeight(normalizedText);
    const miles = extractMiles(normalizedText);
    const overflowWeight = extractOverflowWeight(normalizedText);
    const serviceItems = extractServiceItems(normalizedText);
    const netBalance = extractNetBalance(normalizedText);

    // Validate essential fields
    if (!tripNumber) {
      errors.push('Could not extract trip number from revenue distribution');
    }
    if (netBalance === undefined) {
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
