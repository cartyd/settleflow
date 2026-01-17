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
    // The amount appears in format: "ACCOUNT# DRIVER# TRIP# G/L# AMOUNT"
    // Or in the TOTAL column of the summary line
    let advanceAmount = 0;
    
    // Try to find amount after G/L # pattern (most reliable)
    const glAmountMatch = ocrText.match(/G\/L\s*#\s*[\w-]+\s+([\d,]+\.\d{2})/i);
    if (glAmountMatch) {
      advanceAmount = parseFloat(glAmountMatch[1].replace(/,/g, ''));
    } else {
      // Try to find amount in the TOTAL column
      const totalMatch = ocrText.match(/TOTAL\s*\n[^\n]*\s+([\d,]+\.\d{2})/i);
      if (totalMatch) {
        advanceAmount = parseFloat(totalMatch[1].replace(/,/g, ''));
      } else {
        // Last resort: find any line with pattern "XXXX XXXX XXXX XXXX-XX AMOUNT"
        const lineMatch = ocrText.match(/\d+\s+\d+\s+\d+\s+[\d-]+\s+([\d,]+\.\d{2})/i);
        if (lineMatch) {
          advanceAmount = parseFloat(lineMatch[1].replace(/,/g, ''));
        } else {
          errors.push('Could not extract advance amount from document');
          return { lines, errors };
        }
      }
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
