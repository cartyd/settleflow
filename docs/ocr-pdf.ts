#!/usr/bin/env ts-node

/**
 * PDF OCR using Ollama with vision models
 * Usage: ts-node ocr-pdf.ts <pdf-file> [--model MODEL] [--output OUTPUT] [--separate-pages]
 */

import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { readFile, writeFile, readdir, mkdtemp } from 'fs/promises';
import os from 'os';
import { basename, join } from 'path';
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

interface CliArgs {
  pdfFile: string;
  model: string;
  server: string;
  output?: string;
  separatePages: boolean;
}

async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  const outputDir = await mkdirUniqueTempDir();
  const prefix = basename(pdfPath, '.pdf');

  try {
    // Ensure pdftocairo is available
    await ensureBinaryAvailable('pdftocairo');

    // Use execFile to avoid shell interpretation
    await execFilePromise('pdftocairo', ['-png', pdfPath, join(outputDir, prefix)]);

    // pdftocairo creates files like: prefix-1.png, prefix-2.png, etc.
    const files = (await readdir(outputDir))
      .filter(f => f.startsWith(prefix) && f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/-?(\d+)\.png$/)?.[1] || '0');
        const numB = parseInt(b.match(/-?(\d+)\.png$/)?.[1] || '0');
        return numA - numB;
      })
      .map(f => join(outputDir, f));

    if (files.length === 0) {
      throw new Error('No images were generated from PDF conversion.');
    }

    return files;
  } catch (error) {
    // Let caller handle errors for better testability
    throw error instanceof Error ? error : new Error(String(error));
  }
}

async function mkdirUniqueTempDir(): Promise<string> {
  const base = join(os.tmpdir(), 'pdf-ocr-');
  // mkdtemp ensures a unique directory per run
  const unique = await mkdtemp(base);
  return unique;
}

async function ensureBinaryAvailable(binaryName: string): Promise<void> {
  try {
    await execFilePromise('which', [binaryName]);
  } catch {
    throw new Error(`Required binary not found: ${binaryName}. Please install it (e.g., brew install poppler).`);
  }
}

async function imageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = await readFile(imagePath);
  return imageBuffer.toString('base64');
}

async function ocrImageWithOllama(
  base64Image: string,
  model: string,
  serverUrl: string
): Promise<string | null> {
  type FetchLike = (
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  const fetchFn = (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (!fetchFn) {
    throw new Error('Global fetch is not available. Use Node 18+ or add a fetch polyfill (e.g., undici).');
  }
  const payload: OllamaRequest = {
    model,
    prompt: 'Extract and return all text from this image. Provide only the text content without any additional commentary.',
    stream: false,
    images: [base64Image]
  };

  try {
    const response = await fetchFn(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as OllamaResponse;
    return data.response || '';
  } catch (error) {
    // Propagate errors to be handled at call site
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('Usage: ts-node ocr-pdf.ts <pdf-file> [--model MODEL] [--output OUTPUT] [--server SERVER] [--separate-pages]');
    process.exit(1);
  }

  const result: CliArgs = {
    pdfFile: args[0],
    model: 'gemma3:27b',
    server: 'http://10.147.17.205:11434/api/generate',
    separatePages: false
  };

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
      result.model = args[++i];
    } else if (args[i] === '--output' && i + 1 < args.length) {
      result.output = args[++i];
    } else if (args[i] === '--server' && i + 1 < args.length) {
      result.server = args[++i];
    } else if (args[i] === '--separate-pages') {
      result.separatePages = true;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  if (!existsSync(args.pdfFile)) {
    console.error(`Error: File '${args.pdfFile}' not found`);
    process.exit(1);
  }

  console.error('Converting PDF to images...');
  let imagePaths: string[] = [];
  try {
    imagePaths = await convertPdfToImages(args.pdfFile);
  } catch (err) {
    console.error(`Error converting PDF: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  console.error(`Processing ${imagePaths.length} page(s)...`);

  const allText: string[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    console.error(`Processing page ${i + 1}/${imagePaths.length}...`);
    try {
      const base64Image = await imageToBase64(imagePaths[i]);
      const text = await ocrImageWithOllama(base64Image, args.model, args.server);
      allText.push(`--- Page ${i + 1} ---\n${text}\n`);
    } catch (err) {
      console.error(`Warning: OCR failed for page ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      allText.push(`--- Page ${i + 1} ---\n\n`);
    }
  }

  if (args.separatePages) {
    // Write each page to a separate file
    const outputBase = args.output || basename(args.pdfFile, '.pdf');
    const outputDir = outputBase.includes('/') ? outputBase.substring(0, outputBase.lastIndexOf('/')) : '.';
    const outputName = basename(outputBase, '.txt');

    for (let i = 0; i < allText.length; i++) {
      const pageFile = join(outputDir, `${outputName}-page${i + 1}.txt`);
      await writeFile(pageFile, allText[i]);
      console.error(`Page ${i + 1} written to ${pageFile}`);
    }
  } else {
    // Write all pages to a single file
    const result = allText.join('\n');

    if (args.output) {
      await writeFile(args.output, result);
      console.error(`Output written to ${args.output}`);
    } else {
      console.log(result);
    }
  }
}

main().catch(error => {
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});
