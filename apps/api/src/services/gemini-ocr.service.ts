import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFile, readdir, mkdtemp, rm } from 'fs/promises';
import { basename, join } from 'path';
import { execFile } from 'child_process';
import os from 'os';
import { promisify } from 'util';
import { captureMessage, captureCustomError } from '../utils/sentry.js';

const execFilePromise = promisify(execFile);

export interface GeminiOcrConfig {
  apiKey: string;
  model?: string;
  prompt?: string;
  /** Timeout in milliseconds for OCR requests (default: 120000ms = 120s) */
  timeoutMs?: number;
}

export interface PageText {
  pageNumber: number;
  text: string;
}

/**
 * Default OCR prompt for extracting text from document images
 */
const DEFAULT_OCR_PROMPT =
  'Extract all text from this document page by page. For each page, provide the complete text content exactly as it appears. Preserve formatting, line breaks, and spacing where important for understanding the document structure.';

/**
 * Process a PDF file with Gemini AI and extract text from all pages
 * 
 * Note: Gemini can process PDF files directly without image conversion.
 * This is more efficient than converting to images first.
 * 
 * @throws {Error} If pdfPath is invalid, config is missing required fields, or API request fails
 */
export async function processPdfWithGemini(
  pdfPath: string,
  config: GeminiOcrConfig
): Promise<PageText[]> {
  if (!pdfPath || typeof pdfPath !== 'string') {
    throw new Error('Invalid PDF path provided');
  }
  
  if (!config?.apiKey) {
    throw new Error('Invalid Gemini config: apiKey is required');
  }

  try {
    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({ 
      model: config.model || 'gemini-2.0-flash-exp'
    });

    // Read PDF file
    const pdfBuffer = await readFile(pdfPath);
    const base64Pdf = pdfBuffer.toString('base64');

    // Set up timeout
    const timeoutMs = config.timeoutMs || 120000; // Default 120 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[GEMINI OCR] Processing PDF: ${pdfPath}`);
      console.log(`[GEMINI OCR] File size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

      // Generate content with PDF
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Pdf,
          },
        },
        config.prompt || DEFAULT_OCR_PROMPT,
      ]);

      clearTimeout(timeoutId);

      const response = result.response;
      const text = response.text();

      console.log(`[GEMINI OCR] Received response, text length: ${text.length} characters`);

      // Parse the response to extract text per page
      // Gemini returns all pages in one response, we need to split by page markers
      const pages = parseGeminiResponse(text);
      
      console.log(`[GEMINI OCR] Extracted ${pages.length} pages`);
      
      return pages;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Gemini OCR request timed out after ${timeoutMs}ms`);
      }
      
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GEMINI OCR] Error processing PDF:`, errorMessage);
    
    captureCustomError(error as Error, {
      level: 'error',
      tags: {
        module: 'gemini-ocr',
        operation: 'process_pdf',
      },
      extra: {
        pdfPath,
        model: config.model || 'gemini-1.5-flash',
      },
    });
    
    throw error;
  }
}

/**
 * Process a PDF buffer with Gemini AI and extract text from all pages
 * 
 * @throws {Error} If pdfBuffer is invalid, config is missing required fields, or API request fails
 */
export async function processPdfBufferWithGemini(
  pdfBuffer: Buffer,
  config: GeminiOcrConfig
): Promise<PageText[]> {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('Invalid PDF buffer provided');
  }
  
  if (!config?.apiKey) {
    throw new Error('Invalid Gemini config: apiKey is required');
  }

  try {
    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({ 
      model: config.model || 'gemini-2.0-flash-exp'
    });

    const base64Pdf = pdfBuffer.toString('base64');

    // Set up timeout
    const timeoutMs = config.timeoutMs || 120000; // Default 120 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[GEMINI OCR] Processing PDF buffer`);
      console.log(`[GEMINI OCR] Buffer size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

      // Generate content with PDF
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Pdf,
          },
        },
        config.prompt || DEFAULT_OCR_PROMPT,
      ]);

      clearTimeout(timeoutId);

      const response = result.response;
      const text = response.text();

      console.log(`[GEMINI OCR] Received response, text length: ${text.length} characters`);
      console.log(`[GEMINI OCR] Raw response text:`);
      console.log('='.repeat(80));
      console.log(text);
      console.log('='.repeat(80));

      // Parse the response to extract text per page
      const pages = parseGeminiResponse(text);
      
      console.log(`[GEMINI OCR] Extracted ${pages.length} pages`);
      pages.forEach((page, idx) => {
        console.log(`[GEMINI OCR] Page ${page.pageNumber} (index ${idx}): ${page.text.length} chars`);
        console.log(`[GEMINI OCR] Page ${page.pageNumber} first 200 chars:`, page.text.substring(0, 200));
      });
      
      return pages;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Gemini OCR request timed out after ${timeoutMs}ms`);
      }
      
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GEMINI OCR] Error processing PDF buffer:`, errorMessage);
    
    captureCustomError(error as Error, {
      level: 'error',
      tags: {
        module: 'gemini-ocr',
        operation: 'process_pdf_buffer',
      },
      extra: {
        bufferSize: pdfBuffer.length,
        model: config.model || 'gemini-1.5-flash',
      },
    });
    
    throw error;
  }
}

/**
 * Parse Gemini response text into pages
 * 
 * Gemini may return text in various formats:
 * 1. With markdown page markers: "**Page 1:**\n```\ntext\n```"
 * 2. With explicit page markers: "Page 1:", "Page 2:", etc.
 * 3. With page breaks (form feed character)
 * 4. As continuous text (we need to estimate pages based on content)
 */
function parseGeminiResponse(text: string): PageText[] {
  // Try to detect markdown formatted pages first: **Page 1:** followed by ```
  const markdownPattern = /\*\*Page\s+(\d+):\*\*[\s\n]*```[^\n]*\n([\s\S]*?)```/g;
  const markdownMatches = [...text.matchAll(markdownPattern)];
  
  if (markdownMatches.length > 0) {
    const pages: PageText[] = [];
    
    for (const match of markdownMatches) {
      const pageNum = parseInt(match[1], 10);
      const pageText = match[2].trim();
      
      if (pageText) {
        pages.push({
          pageNumber: pageNum,
          text: pageText,
        });
      }
    }
    
    console.log(`[GEMINI] Parsed ${pages.length} pages using markdown format`);
    return pages;
  }
  
  // Try to detect explicit page markers
  const pageMarkerPattern = /(?:^|\n)(?:Page|PAGE)\s*(\d+)(?::|\s*\n)/g;
  const matches = [...text.matchAll(pageMarkerPattern)];
  
  if (matches.length > 0) {
    // Split by page markers
    const pages: PageText[] = [];
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const pageNum = parseInt(match[1], 10);
      const startIdx = match.index! + match[0].length;
      const endIdx = i < matches.length - 1 ? matches[i + 1].index! : text.length;
      const pageText = text.substring(startIdx, endIdx).trim();
      
      if (pageText) {
        pages.push({
          pageNumber: pageNum,
          text: pageText,
        });
      }
    }
    
    console.log(`[GEMINI] Parsed ${pages.length} pages using plain page markers`);
    return pages;
  }
  
  // Try to split by form feed characters
  const formFeedPages = text.split('\f').filter(p => p.trim());
  if (formFeedPages.length > 1) {
    return formFeedPages.map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText.trim(),
    }));
  }
  
  // If no clear page breaks, return as single page
  // This might happen with single-page documents
  return [{
    pageNumber: 1,
    text: text.trim(),
  }];
}
