import { PrismaClient } from '@prisma/client';
import { processPdfBufferWithOcr, OcrConfig, PageText } from './ocr.service.js';
import { detectDocumentType } from '../parsers/nvl/detectDocumentType.js';

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
  ocrConfig: OcrConfig
): Promise<ProcessPdfResult> {
  // Verify batch exists
  const batch = await prisma.settlementBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new Error('Batch not found');
  }

  // Create import file record
  const importFile = await prisma.importFile.create({
    data: {
      batchId,
      fileName,
      fileSize: fileBuffer.length,
    },
  });

  // Process PDF with OCR
  const pages = await processPdfBufferWithOcr(fileBuffer, ocrConfig);

  // Create import document records for each page
  let documentsCreated = 0;
  for (const page of pages) {
    if (!page.text || page.text.trim().length === 0) {
      continue; // Skip empty pages
    }

    // Detect document type from the text
    const documentType = detectDocumentType(page.text);

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

  return {
    importId: importFile.id,
    documentsDetected: documentsCreated,
    linesProcessed: 0, // Will be updated when we parse the documents
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
