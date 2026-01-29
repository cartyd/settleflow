/**
 * Shared name parsing utilities for NVL parsers
 * 
 * Handles parsing and normalization of person/company names from OCR text
 */

/**
 * Parse a driver name into first and last name components
 * 
 * Supports multiple formats:
 * - Comma-separated: "BIDETTI, DONNY" → {first: "DONNY", last: "BIDETTI"}
 * - Space-separated: "JOHN SMITH" → {first: "JOHN", last: "SMITH"}
 * - Single name: "SMITH" → {last: "SMITH"}
 * 
 * @param fullName - Full name string to parse
 * @returns Object with firstName and/or lastName properties
 * 
 * @example
 * parseDriverName("BIDETTI, DONNY") // { firstName: "DONNY", lastName: "BIDETTI" }
 * parseDriverName("JOHN SMITH") // { firstName: "JOHN", lastName: "SMITH" }
 * parseDriverName("SMITH") // { lastName: "SMITH" }
 */
export function parseDriverName(fullName: string): { firstName?: string; lastName?: string } {
  if (!fullName?.trim()) {
    return {};
  }

  const trimmed = fullName.trim();

  // Format 1: Comma-separated (Last, First)
  const parts = trimmed.split(',').map(p => p.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    return {
      lastName: parts[0],
      firstName: parts[1],
    };
  }

  // Format 2: Space-separated (First Last)
  const spaceParts = trimmed.split(/\s+/).filter(p => p.length > 0);
  if (spaceParts.length >= 2) {
    return {
      firstName: spaceParts[0],
      lastName: spaceParts.slice(1).join(' '),
    };
  }

  // Format 3: Single name (assume last name)
  if (spaceParts.length === 1) {
    return { lastName: spaceParts[0] };
  }

  return {};
}
