import { PrismaClient } from '@prisma/client';
import { processPdfBufferWithOcr, OcrConfig } from './ocr.service.js';
import { processPdfBufferWithGemini, GeminiOcrConfig, PageText } from './gemini-ocr.service.js';
import { detectDocumentType } from '../parsers/nvl/detectDocumentType.js';
import { parseRemittance, BatchMetadata } from '../parsers/nvl/remittance.parser.js';
import { SettlementStatus } from '@settleflow/shared-types';
import { loadConfig } from '@settleflow/shared-config';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export interface AutoBatchImportResult {
  batchId: string;
  importFileId: string;
  nvlPaymentRef: string;
  agencyId: string;
  agencyName: string;
  documentsDetected: number;
  metadata: BatchMetadata;
}

/**
 * Upload PDF and auto-create batch from parsed remittance data
 * 
 * Workflow:
 * 1. Process PDF with OCR to extract all page text
 * 2. Find and parse the REMITTANCE page to extract batch metadata
 * 3. Find or create agency based on agency code
 * 4. Create batch with real data from remittance
 * 5. Save all import documents
 * 6. Return batch info for redirect
 */
export async function uploadPdfAndCreateBatch(
  prisma: PrismaClient,
  fileName: string,
  fileBuffer: Buffer,
  ocrConfig: OcrConfig | GeminiOcrConfig,
  userId: string
): Promise<AutoBatchImportResult> {
  // Step 1: Process PDF with OCR
  const config = loadConfig();
  let pages: PageText[];
  
  if (config.ocr.provider === 'gemini') {
    console.log(`[AUTO-BATCH] Using Gemini OCR provider`);
    pages = await processPdfBufferWithGemini(fileBuffer, ocrConfig as GeminiOcrConfig);
  } else {
    console.log(`[AUTO-BATCH] Using Ollama OCR provider`);
    pages = await processPdfBufferWithOcr(fileBuffer, ocrConfig as OcrConfig);
  }

  if (pages.length === 0) {
    throw new Error('No pages extracted from PDF');
  }

  // Step 2: Find and parse remittance page
  let remittanceMetadata: BatchMetadata | undefined;
  
  for (const page of pages) {
    if (!page.text || page.text.trim().length === 0) {
      continue;
    }

    const docType = detectDocumentType(page.text);
    
    if (docType === 'REMITTANCE') {
      const parseResult = parseRemittance(page.text);
      
      if (parseResult.metadata) {
        remittanceMetadata = parseResult.metadata;
        break;
      }
    }
  }

  if (!remittanceMetadata) {
    console.error('[AUTO-BATCH] Failed to parse remittance from any page');
    console.error('[AUTO-BATCH] First page text sample:', pages[0]?.text?.substring(0, 500));
    throw new Error('Could not extract batch metadata from remittance page. Please ensure the PDF contains a valid NVL remittance page.');
  }

  // Validate essential metadata
  if (!remittanceMetadata.nvlPaymentRef || !remittanceMetadata.agencyCode) {
    throw new Error('Missing required fields: payment reference or agency code');
  }

  // Step 3: Find or create agency
  let agency = await prisma.agency.findUnique({
    where: { code: remittanceMetadata.agencyCode },
  });

  if (!agency) {
    // Create new agency
    agency = await prisma.agency.create({
      data: {
        code: remittanceMetadata.agencyCode,
        name: remittanceMetadata.agencyName,
        active: true,
      },
    });
  }

  // Step 4: Check for existing batch with same payment ref
  const existingBatch = await prisma.settlementBatch.findUnique({
    where: {
      agencyId_nvlPaymentRef: {
        agencyId: agency.id,
        nvlPaymentRef: remittanceMetadata.nvlPaymentRef,
      },
    },
  });

  if (existingBatch) {
    throw new Error(
      `A batch already exists for payment reference ${remittanceMetadata.nvlPaymentRef}. ` +
      `Batch ID: ${existingBatch.id}`
    );
  }

  // Calculate week dates or use defaults
  const checkDate = new Date(remittanceMetadata.checkDate);
  const weekStartDate = remittanceMetadata.weekStartDate 
    ? new Date(remittanceMetadata.weekStartDate)
    : new Date(checkDate.getTime() - 14 * 24 * 60 * 60 * 1000); // 2 weeks before
  const weekEndDate = remittanceMetadata.weekEndDate
    ? new Date(remittanceMetadata.weekEndDate)
    : new Date(checkDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week before

  // Step 5: Create batch with real data
  const batch = await prisma.settlementBatch.create({
    data: {
      agencyId: agency.id,
      nvlPaymentRef: remittanceMetadata.nvlPaymentRef,
      status: SettlementStatus.CREATED,
      weekStartDate,
      weekEndDate,
      totalRevenue: 0, // Will be calculated after parsing
      totalAdvances: 0,
      totalDeductions: 0,
      netAmount: 0,
    },
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      batchId: batch.id,
      action: 'BATCH_CREATED',
      performedBy: userId,
      afterSnapshot: JSON.stringify({
        ...batch,
        source: 'auto-import',
        fileName,
      }),
    },
  });

  // Step 6: Save PDF to disk storage
  await mkdir(config.storage.pdfPath, { recursive: true });
  const pdfPath = path.join(config.storage.pdfPath, fileName);
  await writeFile(pdfPath, fileBuffer);

  // Step 7: Create import file record
  const importFile = await prisma.importFile.create({
    data: {
      batchId: batch.id,
      fileName,
      fileSize: fileBuffer.length,
    },
  });

  // Step 8: Save all import documents
  let documentsCreated = 0;
  for (const page of pages) {
    if (!page.text || page.text.trim().length === 0) {
      continue;
    }

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
    batchId: batch.id,
    importFileId: importFile.id,
    nvlPaymentRef: remittanceMetadata.nvlPaymentRef,
    agencyId: agency.id,
    agencyName: agency.name,
    documentsDetected: documentsCreated,
    metadata: remittanceMetadata,
  };
}
