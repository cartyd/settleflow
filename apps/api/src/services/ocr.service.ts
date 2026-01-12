import { readFile, writeFile, readdir, mkdtemp, rm } from 'fs/promises';
import { basename, join } from 'path';
import { execFile } from 'child_process';
import os from 'os';
import { promisify } from 'util';

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

export interface OcrConfig {
  model: string;
  serverUrl: string;
}

export interface PageText {
  pageNumber: number;
  text: string;
}

/**
 * Convert PDF to PNG images using pdftocairo
 */
async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  const outputDir = await mkdtemp(join(os.tmpdir(), 'pdf-ocr-'));
  const prefix = basename(pdfPath, '.pdf');

  try {
    // Ensure pdftocairo is available
    await ensureBinaryAvailable('pdftocairo');

    // Convert PDF to PNG images
    await execFilePromise('pdftocairo', [
      '-png',
      pdfPath,
      join(outputDir, prefix),
    ]);

    // pdftocairo creates files like: prefix-1.png, prefix-2.png, etc.
    const files = (await readdir(outputDir))
      .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/-?(\d+)\.png$/)?.[1] || '0');
        const numB = parseInt(b.match(/-?(\d+)\.png$/)?.[1] || '0');
        return numA - numB;
      })
      .map((f) => join(outputDir, f));

    if (files.length === 0) {
      throw new Error('No images were generated from PDF conversion.');
    }

    return files;
  } catch (error) {
    // Clean up on error
    await rm(outputDir, { recursive: true, force: true }).catch(() => {});
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
    throw new Error(
      `Required binary not found: ${binaryName}. Please install it (e.g., brew install poppler).`
    );
  }
}

/**
 * Convert image file to base64 string
 */
async function imageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = await readFile(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * Extract text from image using Ollama vision model
 */
async function ocrImageWithOllama(
  base64Image: string,
  config: OcrConfig
): Promise<string> {
  const payload: OllamaRequest = {
    model: config.model,
    prompt:
      'Extract and return all text from this image. Provide only the text content without any additional commentary.',
    stream: false,
    images: [base64Image],
  };

  const response = await fetch(config.serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error! status: ${response.status}`);
  }

  const data = (await response.json()) as OllamaResponse;
  return data.response || '';
}

/**
 * Process a PDF file and extract text from all pages
 */
export async function processPdfWithOcr(
  pdfPath: string,
  config: OcrConfig
): Promise<PageText[]> {
  let imagePaths: string[] = [];
  let outputDir: string | null = null;

  try {
    // Convert PDF to images
    imagePaths = await convertPdfToImages(pdfPath);
    outputDir = join(imagePaths[0], '..');

    const results: PageText[] = [];

    // Process each page
    for (let i = 0; i < imagePaths.length; i++) {
      try {
        const base64Image = await imageToBase64(imagePaths[i]);
        const text = await ocrImageWithOllama(base64Image, config);
        results.push({
          pageNumber: i + 1,
          text: text.trim(),
        });
      } catch (error) {
        // Log error but continue processing other pages
        console.error(
          `OCR failed for page ${i + 1}:`,
          error instanceof Error ? error.message : String(error)
        );
        results.push({
          pageNumber: i + 1,
          text: '',
        });
      }
    }

    return results;
  } finally {
    // Clean up temporary files
    if (outputDir) {
      await rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Process a PDF buffer and extract text from all pages
 */
export async function processPdfBufferWithOcr(
  pdfBuffer: Buffer,
  config: OcrConfig
): Promise<PageText[]> {
  // Create temporary file for the PDF
  const tempDir = await mkdtemp(join(os.tmpdir(), 'pdf-upload-'));
  const tempPdfPath = join(tempDir, 'upload.pdf');

  try {
    await writeFile(tempPdfPath, pdfBuffer);
    return await processPdfWithOcr(tempPdfPath, config);
  } finally {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
