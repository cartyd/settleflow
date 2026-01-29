import { execFile } from 'child_process';
import { readFile, writeFile, readdir, mkdtemp, rm } from 'fs/promises';
import os from 'os';
import { basename, join } from 'path';
import { promisify } from 'util';

import { captureMessage, captureCustomError } from '../utils/sentry.js';

const execFilePromise = promisify(execFile);

interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
  images: string[];
}

interface OllamaResponse {
  response: string;
}

/**
 * Validate and parse Ollama API response
 * Ensures the response matches expected shape before using it
 */
function validateOllamaResponse(data: unknown): OllamaResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid Ollama response: expected object, got ' + typeof data);
  }

  const obj = data as Record<string, unknown>;

  if (!('response' in obj)) {
    throw new Error('Invalid Ollama response: missing "response" field');
  }

  if (typeof obj.response !== 'string') {
    throw new Error(
      `Invalid Ollama response: "response" field must be string, got ${typeof obj.response}`
    );
  }

  return {
    response: obj.response,
  };
}

export interface OcrConfig {
  model: string;
  serverUrl: string;
  prompt?: string;
  /** Maximum number of pages to process concurrently (default: 1 for sequential processing) */
  concurrency?: number;
  /** Timeout in milliseconds for OCR requests (default: 30000ms = 30s) */
  timeoutMs?: number;
}

/**
 * Default OCR prompt for extracting text from document images
 */
const DEFAULT_OCR_PROMPT =
  'Extract and return all text from this image. Provide only the text content without any additional commentary.';

/**
 * Get platform-specific installation instructions for a binary
 */
function getBinaryInstallInstructions(binaryName: string): string {
  const platform = process.platform;

  switch (binaryName) {
    case 'pdftocairo':
      if (platform === 'darwin') {
        return 'brew install poppler';
      } else if (platform === 'linux') {
        return 'apt-get install poppler-utils (Debian/Ubuntu) or yum install poppler-utils (RHEL/CentOS)';
      } else if (platform === 'win32') {
        return 'Download from https://poppler.freedesktop.org/ or use choco install poppler';
      }
      return 'Please install poppler-utils for your operating system';

    default:
      return `Please install ${binaryName} for your operating system`;
  }
}

export interface PageText {
  pageNumber: number;
  text: string;
}

interface PdfConversionResult {
  imagePaths: string[];
  cleanup: () => Promise<void>;
}

/**
 * Convert PDF to PNG images using pdftocairo
 * Returns image paths and a cleanup function to remove temporary files
 *
 * Note: This is a critical operation - if it fails, we cannot proceed with OCR.
 * Unlike per-page OCR errors, PDF conversion errors are unrecoverable.
 *
 * The caller is responsible for calling the cleanup function after processing.
 *
 * @throws {Error} If pdfPath is invalid or pdftocairo is not available
 */
async function convertPdfToImages(pdfPath: string): Promise<PdfConversionResult> {
  if (!pdfPath || typeof pdfPath !== 'string') {
    throw new Error('Invalid PDF path provided');
  }

  const outputDir = await mkdtemp(join(os.tmpdir(), 'pdf-ocr-'));
  const prefix = basename(pdfPath, '.pdf');

  try {
    // Ensure pdftocairo is available
    await ensureBinaryAvailable('pdftocairo');

    // Convert PDF to PNG images
    await execFilePromise('pdftocairo', ['-png', pdfPath, join(outputDir, prefix)]);

    // pdftocairo creates files like: prefix-1.png, prefix-2.png, etc.
    // Filter and validate filenames match expected pattern
    const pngFiles = (await readdir(outputDir)).filter(
      (filename) => filename.startsWith(prefix) && filename.endsWith('.png')
    );

    // Extract page numbers and validate all files match the expected pattern
    const filesWithPageNumbers = pngFiles.map((filename) => {
      const match = filename.match(/-?(\d+)\.png$/);
      if (!match?.[1]) {
        throw new Error(
          `Unexpected filename format from pdftocairo: ${filename}. Expected format: ${prefix}-N.png`
        );
      }
      return {
        filename,
        pageNumber: parseInt(match[1], 10),
      };
    });

    // Sort by page number and return full paths
    const files = filesWithPageNumbers
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((file) => join(outputDir, file.filename));

    if (files.length === 0) {
      throw new Error('No images were generated from PDF conversion.');
    }

    // Return image paths and cleanup function
    // Cleanup function encapsulates the temporary directory management
    return {
      imagePaths: files,
      cleanup: async () => {
        await rm(outputDir, { recursive: true, force: true }).catch((cleanupError) => {
          console.error('Failed to clean up temporary directory:', outputDir, cleanupError);
          captureMessage(`Failed to clean up OCR temporary directory: ${outputDir}`, 'warning', {
            tags: { module: 'ocr', operation: 'cleanup' },
            extra: { outputDir, error: cleanupError },
          });
        });
      },
    };
  } catch (error) {
    // Clean up on error and re-throw
    // PDF conversion errors are unrecoverable - we need the images to proceed
    await rm(outputDir, { recursive: true, force: true }).catch((cleanupError) => {
      console.error('Failed to clean up temporary directory:', outputDir, cleanupError);
      captureMessage(
        `Failed to clean up OCR temporary directory after error: ${outputDir}`,
        'warning',
        {
          tags: { module: 'ocr', operation: 'cleanup_after_error' },
          extra: { outputDir, error: cleanupError },
        }
      );
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Ensure required binary is available
 */
async function ensureBinaryAvailable(binaryName: string): Promise<void> {
  try {
    await execFilePromise('which', [binaryName]);
  } catch {
    const instructions = getBinaryInstallInstructions(binaryName);
    throw new Error(`Required binary not found: ${binaryName}. Install with: ${instructions}`);
  }
}

/**
 * Convert image file to base64 string
 *
 * Note: For very large images, this could consume significant memory.
 * Consider processing in batches if memory becomes an issue.
 */
async function imageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = await readFile(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * Extract text from image using Ollama vision model
 *
 * @throws {Error} If config is invalid, Ollama API request fails, or request times out
 */
async function ocrImageWithOllama(base64Image: string, config: OcrConfig): Promise<string> {
  if (!config?.model || !config?.serverUrl) {
    throw new Error('Invalid OCR config: model and serverUrl are required');
  }

  // Validate serverUrl is a valid URL
  try {
    new URL(config.serverUrl);
  } catch {
    throw new Error(`Invalid server URL: ${config.serverUrl}`);
  }

  const payload: OllamaRequest = {
    model: config.model,
    prompt: config.prompt || DEFAULT_OCR_PROMPT,
    stream: false,
    images: [base64Image],
  };

  // Set up timeout using AbortController
  const timeoutMs = config.timeoutMs || 30000; // Default 30 seconds
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      throw new Error(
        `Ollama API error! status: ${response.status}, body: ${errorText.substring(0, 200)}`
      );
    }

    // Parse and validate response structure
    let rawData: unknown;
    try {
      rawData = await response.json();
    } catch (error) {
      throw new Error(
        `Failed to parse Ollama response as JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const data = validateOllamaResponse(rawData);
    return data.response || '';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OCR request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Process a PDF file and extract text from all pages
 *
 * @throws {Error} If pdfPath is invalid or config is missing required fields
 */
export async function processPdfWithOcr(pdfPath: string, config: OcrConfig): Promise<PageText[]> {
  if (!pdfPath || typeof pdfPath !== 'string') {
    throw new Error('Invalid PDF path provided');
  }

  if (!config?.model || !config?.serverUrl) {
    throw new Error('Invalid OCR config: model and serverUrl are required');
  }

  // Convert PDF to images - this creates temp files and returns cleanup function
  const { imagePaths, cleanup } = await convertPdfToImages(pdfPath);

  console.log(`[OCR] PDF converted to ${imagePaths.length} images`);
  console.log(`[OCR] Image paths:`, imagePaths);

  try {
    if (imagePaths.length === 0) {
      throw new Error('No images were generated from PDF conversion.');
    }

    const results: PageText[] = [];
    const concurrency = config.concurrency || 1;

    // Process pages with controlled concurrency to manage memory usage
    // For large PDFs, processing all pages at once could exhaust memory
    for (let i = 0; i < imagePaths.length; i += concurrency) {
      const batch = imagePaths.slice(i, i + concurrency);
      const batchPromises = batch.map(async (imagePath, batchIndex) => {
        const pageIndex = i + batchIndex;
        try {
          const base64Image = await imageToBase64(imagePath);
          const text = await ocrImageWithOllama(base64Image, config);
          return {
            pageNumber: pageIndex + 1,
            text: text.trim(),
          };
        } catch (error) {
          // Per-page OCR errors are recoverable - log and continue with empty text
          // This allows processing other pages even if one fails
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`OCR failed for page ${pageIndex + 1}:`, errorMessage);

          captureCustomError(error as Error, {
            level: 'warning',
            tags: {
              module: 'ocr',
              operation: 'process_page',
              pageNumber: String(pageIndex + 1),
            },
            extra: {
              pageNumber: pageIndex + 1,
              imagePath,
              totalPages: imagePaths.length,
            },
          });

          return {
            pageNumber: pageIndex + 1,
            text: '',
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      console.log(
        `[OCR] Processed batch ${i / concurrency + 1}, total results so far: ${results.length}`
      );
      for (const result of batchResults) {
        console.log(`[OCR] Page ${result.pageNumber}: ${result.text.length} chars`);
      }
    }

    return results;
  } finally {
    // Clean up temporary files using the provided cleanup function
    await cleanup();
  }
}

/**
 * Process a PDF buffer and extract text from all pages
 *
 * @throws {Error} If pdfBuffer is invalid or config is missing required fields
 */
export async function processPdfBufferWithOcr(
  pdfBuffer: Buffer,
  config: OcrConfig
): Promise<PageText[]> {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('Invalid PDF buffer provided');
  }

  if (!config?.model || !config?.serverUrl) {
    throw new Error('Invalid OCR config: model and serverUrl are required');
  }
  // Create temporary file for the PDF
  const tempDir = await mkdtemp(join(os.tmpdir(), 'pdf-upload-'));
  const tempPdfPath = join(tempDir, 'upload.pdf');

  try {
    await writeFile(tempPdfPath, pdfBuffer);
    return await processPdfWithOcr(tempPdfPath, config);
  } finally {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true }).catch((cleanupError) => {
      console.error('Failed to clean up temporary directory:', tempDir, cleanupError);
      captureMessage(`Failed to clean up PDF upload temporary directory: ${tempDir}`, 'warning', {
        tags: { module: 'ocr', operation: 'cleanup_upload' },
        extra: { tempDir, error: cleanupError },
      });
    });
  }
}
