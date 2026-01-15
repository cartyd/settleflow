/**
 * Regex-based parser for ADVANCE_ADVICE document type
 * 
 * Advance documents show cash advances given to drivers (COMDATA, etc.)
 */

export interface AdvanceLine {
  tripNumber?: string;
  accountNumber?: string;
  driverName?: string;
  advanceAmount: number;
  description?: string;
  date?: string;
  rawText: string;
}

export interface AdvanceParseResult {
  lines: AdvanceLine[];
  errors: string[];
}

/**
 * Parse date in MMDDYY format to ISO string
 */
function parseDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  const match = dateStr.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    const [, month, day, year] = match;
    const fullYear = `20${year}`;
    return `${fullYear}-${month}-${day}`;
  }
  
  return undefined;
}

/**
 * Parse ADVANCE_ADVICE document using regex patterns
 */
export function parseAdvance(ocrText: string): AdvanceParseResult {
  const errors: string[] = [];
  const lines: AdvanceLine[] = [];

  try {
    // Extract trip number
    const tripMatch = ocrText.match(/TRIP\s+(\d+)/i);
    const tripNumber = tripMatch ? tripMatch[1] : undefined;

    // Extract account number
    const accountMatch = ocrText.match(/ACCOUNT\s+(\d+)/i);
    const accountNumber = accountMatch ? accountMatch[1] : undefined;

    // Extract driver name (format: LASTNAME, FIRSTNAME or just name)
    const driverMatch = ocrText.match(/DRIVER[-\s]+>?\s*([A-Z,\s]+)/i);
    const driverName = driverMatch ? driverMatch[1].trim() : undefined;

    // Extract advance amount
    // The amount appears on the last line after the G/L #
    // Format: "3101 071 1855 2032-01 518.00" (last number on last line)
    let advanceAmount = 0;
    
    // Split into lines and get last line
    const textLines = ocrText.trim().split('\n');
    const lastLine = textLines[textLines.length - 1];
    
    // Extract last decimal number from last line
    const amountMatch = lastLine.match(/(\d+\.\d{2})\s*$/);
    if (amountMatch) {
      advanceAmount = parseFloat(amountMatch[1]);
    } else {
      errors.push('Could not extract advance amount from last line: ' + lastLine);
      return { lines, errors };
    }

    // Extract date
    const dateMatch = ocrText.match(/DATE[-\s]+>?\s*(\d{6})/i);
    const date = parseDate(dateMatch ? dateMatch[1] : undefined);

    // Determine description (COMDATA, CASH ADVANCE, etc.)
    let description = 'COMDATA';
    if (ocrText.toUpperCase().includes('COMDATA')) {
      description = 'COMDATA';
    } else if (ocrText.toUpperCase().includes('CASH ADVANCE')) {
      description = 'CASH ADVANCE';
    }

    lines.push({
      tripNumber,
      accountNumber,
      driverName,
      advanceAmount,
      description,
      date,
      rawText: ocrText,
    });

  } catch (error) {
    errors.push(`Error parsing advance: ${error}`);
  }

  return { lines, errors };
}
