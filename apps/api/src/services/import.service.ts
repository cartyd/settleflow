import { PrismaClient } from '@prisma/client';
import { loadConfig } from '@settleflow/shared-config';

import { detectDocumentType } from '../parsers/nvl/detectDocumentType.js';
import { logger } from '../utils/sentry.js';

import { processPdfBufferWithGemini, GeminiOcrConfig, PageText } from './gemini-ocr.service.js';
import { parseImportFile } from './import-line.service.js';
import { processPdfBufferWithOcr, OcrConfig } from './ocr.service.js';

export interface ProcessPdfResult {
  importId: string;
  documentsDetected: number;
  linesProcessed: number;
}

/**
 * Process uploaded PDF file with OCR and store in database
 */
export async function processUploadedPdf(
  prisma: PrismaClient,
  batchId: string,
  fileName: string,
  fileBuffer: Buffer,
  ocrConfig: OcrConfig | GeminiOcrConfig
): Promise<ProcessPdfResult> {
  // Verify batch exists
  const batch = await prisma.settlementBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    const error = 'Batch not found';
    logger.error(error, { batchId });
    throw new Error(error);
  }

  // Log file import start
  logger.info('File import started', {
    batchId,
    fileName,
    fileSizeMB: (fileBuffer.length / (1024 * 1024)).toFixed(2),
  });

  // Create import file record
  const importFile = await prisma.importFile.create({
    data: {
      batchId,
      fileName,
      fileSize: fileBuffer.length,
    },
  });

  // Process PDF with OCR
  console.log(`[IMPORT] Starting OCR processing for ${fileName}`);
  
  // Determine which OCR provider to use
  const config = loadConfig();
  let pages: PageText[];
  
  if (config.ocr.provider === 'gemini') {
    console.log(`[IMPORT] Using Gemini OCR provider`);
    pages = await processPdfBufferWithGemini(fileBuffer, ocrConfig as GeminiOcrConfig);
  } else {
    console.log(`[IMPORT] Using Ollama OCR provider`);
    pages = await processPdfBufferWithOcr(fileBuffer, ocrConfig as OcrConfig);
  }
  
  console.log(`[IMPORT] OCR returned ${pages.length} pages`);
  console.log(`[IMPORT] Page numbers:`, pages.map(p => p.pageNumber));

  // Create import document records for each page
  let documentsCreated = 0;
  let pagesWithEmptyText = 0;
  for (const page of pages) {
    const hasText = page.text && page.text.trim().length > 0;
    
    if (!hasText) {
      console.log(`[IMPORT] WARNING: Page ${page.pageNumber} has no text - OCR may have failed`);
      pagesWithEmptyText++;
    }

    // Detect document type from the text (will be UNKNOWN for empty pages)
    const documentType = hasText ? detectDocumentType(page.text) : 'UNKNOWN';

    await prisma.importDocument.create({
      data: {
        importFileId: importFile.id,
        documentType,
        pageNumber: page.pageNumber,
        rawText: page.text,
      },
    });

    documentsCreated++;
  }

  // Log successful import
  console.log(`[IMPORT] Created ${documentsCreated} documents, ${pagesWithEmptyText} pages with empty text, total pages from OCR: ${pages.length}`);
  if (pagesWithEmptyText > 0) {
    console.warn(`[IMPORT] WARNING: ${pagesWithEmptyText} pages had no OCR text - check Ollama logs for errors`);
  }
  logger.info('File import completed', {
    importFileId: importFile.id,
    batchId,
    fileName,
    documentsDetected: documentsCreated,
    pagesWithEmptyText,
    totalPages: pages.length,
  });

  // Automatically parse documents after import
  console.log(`[IMPORT] Starting automatic parsing for ${importFile.id}`);
  let linesProcessed = 0;
  let parsingStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' = 'COMPLETED';
  let parsingErrors: string[] = [];

  try {
    const parseResult = await parseImportFile(prisma, importFile.id);
    linesProcessed = parseResult.totalLinesCreated;
    parsingErrors = parseResult.errors;

    // Determine parsing status based on results
    if (linesProcessed === 0 && parsingErrors.length > 0) {
      // No data extracted and has errors = FAILED
      parsingStatus = 'FAILED';
    } else if (parsingErrors.length > 0) {
      // Has data but also has errors = PARTIAL
      parsingStatus = 'PARTIAL';
    } else {
      // No errors = COMPLETED
      parsingStatus = 'COMPLETED';
    }

    console.log(`[IMPORT] Parsing completed with status: ${parsingStatus}, lines: ${linesProcessed}, errors: ${parsingErrors.length}`);
  } catch (error) {
    // Critical parsing failure
    parsingStatus = 'FAILED';
    const errorMessage = error instanceof Error ? error.message : String(error);
    parsingErrors = [`Critical parsing error: ${errorMessage}`];
    console.error(`[IMPORT] Parsing failed critically:`, error);
    logger.error('Document parsing failed', {
      importFileId: importFile.id,
      error: errorMessage,
    });
  }

  // Update import file with parsing status
  await prisma.importFile.update({
    where: { id: importFile.id },
    data: {
      parsingStatus,
      parsingCompletedAt: new Date(),
      parsingErrors: parsingErrors.length > 0 ? JSON.stringify(parsingErrors) : null,
    },
  });

  logger.info('File import and parsing completed', {
    importFileId: importFile.id,
    batchId,
    fileName,
    documentsDetected: documentsCreated,
    linesProcessed,
    parsingStatus,
    errorCount: parsingErrors.length,
  });

  return {
    importId: importFile.id,
    documentsDetected: documentsCreated,
    linesProcessed,
  };
}

/**
 * Get import file with documents
 */
export async function getImportFile(prisma: PrismaClient, importId: string) {
  return await prisma.importFile.findUnique({
    where: { id: importId },
    include: {
      importDocuments: true,
    },
  });
}
