/**
 * OCR text normalization utilities for handling format differences between providers
 */

export type OcrProvider = 'ollama' | 'gemini';

/**
 * Normalize OCR text to consistent format regardless of provider
 */
export function normalizeOcrText(text: string, provider?: OcrProvider): string {
  if (!text) return '';

  let normalized = text;

  // Common normalizations for all providers
  normalized = normalized
    // Remove excessive whitespace
    .replace(/\s{3,}/g, '  ')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove trailing whitespace from lines
    .replace(/[ \t]+$/gm, '');

  // Provider-specific normalizations
  if (provider === 'gemini') {
    normalized = normalizeGeminiText(normalized);
  } else if (provider === 'ollama') {
    normalized = normalizeOllamaText(normalized);
  }

  return normalized.trim();
}

/**
 * Heuristically detect the OCR provider from raw text.
 * Returns 'gemini' when Gemini-specific artifacts are present; otherwise undefined.
 */
export function detectOcrProvider(text: string): OcrProvider | undefined {
  if (!text) return undefined;

  // Gemini often introduces split headers and Unicode artifacts seen in samples
  const looksLikeGemini =
    /יווווד/.test(text) ||
    /BILL\s+OF\s+\n\s*LADING/i.test(text) ||
    /NET\s+\n\s*BALANCE/i.test(text) ||
    /TRANSACTION\s*\/\s*\n\s*DESCRIPTION/i.test(text);

  if (looksLikeGemini) return 'gemini';
  // Return undefined to apply only common normalizations; callers may override.
  return undefined;
}

/**
 * Gemini-specific text normalizations
 */
function normalizeGeminiText(text: string): string {
  return (
    text
      // Remove Hebrew/Unicode artifacts that appear in Gemini output
      .replace(/יווווד/g, '')

      // Fix split company names that get broken across lines
      .replace(/MOVING\s*&\s*ST\s*\/\s*BIDETTI,?\s*\n\s*DONNY/gi, 'MOVING & ST/ BIDETTI, DONNY')
      .replace(/CICEROS'\s*\n\s*MOVING\s*&\s*STORAGE/gi, "CICEROS' MOVING & STORAGE")
      .replace(/CICEROS'\s*\n\s*MOVING\s*&\s*ST/gi, "CICEROS' MOVING & ST")

      // Fix split driver names
      .replace(/BIDETTI,\s*\n\s*DONNY/gi, 'BIDETTI, DONNY')

      // Fix split account/trip numbers that may be broken across lines
      .replace(/ACCOUNT\s*\n\s*NUMBER\s*\n\s*(\d+)/gi, 'ACCOUNT NUMBER $1')
      .replace(/TRIP\s*\n\s*NUMBER\s*\n\s*(\d+)/gi, 'TRIP NUMBER $1')

      // Fix split amounts that may be broken across lines
      .replace(/(\d+),?\s*\n\s*(\d{3})\s*\.\s*(\d{2})/g, '$1,$2.$3')
      .replace(/(\d+)\s*\.\s*\n\s*(\d{2})/g, '$1.$2')

      // Fix split dates
      .replace(/(\d{2})\/\s*\n\s*(\d{2})\/\s*\n\s*(\d{2})/g, '$1/$2/$3')
      .replace(/(\d{2})\s*\/\s*(\d{2})\s*\/\s*\n\s*(\d{2})/g, '$1/$2/$3')

      // Normalize spacing around forward slashes
      .replace(/\s*\/\s*/g, '/')

      // Fix table headers that may be split
      .replace(/TRANSACTION\s*\/\s*\n\s*DESCRIPTION/gi, 'TRANSACTION/DESCRIPTION')
      .replace(/BILL\s+OF\s+\n\s*LADING/gi, 'BILL OF LADING')
      .replace(/NET\s+\n\s*BALANCE/gi, 'NET BALANCE')
      .replace(/GENERAL\s+LEDGER\s+\n\s*AGENT/gi, 'GENERAL LEDGER AGENT')
  );
}

/**
 * Ollama-specific text normalizations
 */
function normalizeOllamaText(text: string): string {
  return (
    text
      // Ollama typically has cleaner output, minimal normalization needed
      // Remove excessive dashes that sometimes appear
      .replace(/-{3,}/g, '---')
  );
}

/**
 * Enhanced regex builder for flexible pattern matching
 */
export class FlexibleRegex {
  /**
   * Create a flexible whitespace pattern that handles line breaks and varying whitespace
   */
  static flexibleWhitespace(required = false): string {
    return required ? '\\s*\\n?\\s+' : '\\s*\\n?\\s*';
  }

  /**
   * Create a pattern for matching text that might be split across lines
   */
  static crossLine(text: string): string {
    return text.split(/\s+/).join('\\s*\\n?\\s*');
  }

  /**
   * Create a pattern for matching amounts with flexible formatting
   */
  static amount(): string {
    return '\\d{1,3}(?:,\\d{3})*\\.\\d{2}';
  }

  /**
   * Create a pattern for matching dates with flexible separators
   */
  static date(): string {
    return '\\d{1,2}[/\\-\\s]*\\d{1,2}[/\\-\\s]*\\d{2,4}';
  }
}

/**
 * Pattern helpers for common OCR variations
 */
export const OCR_PATTERNS = {
  // Common field patterns that work across providers
  ACCOUNT: /ACCOUNT\s*(?:NUMBER)?\s*\n?\s*(\d+)/i,
  TRIP: /TRIP\s*(?:NUMBER)?\s*\n?\s*(\d+)/i,
  DRIVER: /DRIVER[-\s]*>?\s*([A-Z][A-Z,\s&'.-]*?)(?=\n[A-Z]+\s*[:\-]|\nAPPROVAL|\nCONF|$)/is,
  AMOUNT: new RegExp(`(${FlexibleRegex.amount()})`),
  DATE_MMDDYY: /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2})/,
  DATE_COMPACT: /(\d{6})/,
} as const;
