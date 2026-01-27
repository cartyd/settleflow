import { PrismaClient } from '@prisma/client';
import { processPdfBufferWithOcr, OcrConfig } from './ocr.service.js';
import { processPdfBufferWithGemini, GeminiOcrConfig, PageText } from './gemini-ocr.service.js';
import { detectDocumentType } from '../parsers/nvl/detectDocumentType.js';
import { parseRemittance, BatchMetadata } from '../parsers/nvl/remittance.parser.js';
import { extractBatchMetadata as extractBatchMetadataFromSettlement } from '../parsers/nvl/settlement-detail.parser.js';
import { SettlementStatus } from '@settleflow/shared-types';
import { loadConfig } from '@settleflow/shared-config';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { parseImportFile, extractPlainText } from './import-line.service.js';
import { logger } from '../utils/sentry.js';

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

  // Step 2: Find and parse remittance page (or settlement detail as fallback)
  let remittanceMetadata: BatchMetadata | undefined;
  let settlementDetailPages: Array<{ pageNumber: number; text: string }> = [];
  
  console.log(`[AUTO-BATCH] Processing ${pages.length} pages from OCR`);
  
  for (const page of pages) {
    if (!page.text || page.text.trim().length === 0) {
      console.log(`[AUTO-BATCH] Page ${page.pageNumber}: EMPTY`);
      continue;
    }

    // Extract plain text in case it's JSON formatted from Gemini
    const plainText = extractPlainText(page.text);
    const docType = detectDocumentType(plainText);
    console.log(`[AUTO-BATCH] Page ${page.pageNumber}: Detected as ${docType}, text length: ${plainText.length}`);
    
    if (docType === 'REMITTANCE') {
      console.log(`[AUTO-BATCH] Attempting to parse remittance from page ${page.pageNumber}`);
      const parseResult = parseRemittance(plainText);
      
      if (parseResult.metadata) {
        console.log(`[AUTO-BATCH] Successfully parsed remittance metadata from page ${page.pageNumber}`);
        remittanceMetadata = parseResult.metadata;
        break;
      } else {
        console.log(`[AUTO-BATCH] Page ${page.pageNumber} detected as REMITTANCE but parsing failed`);
        console.log(`[AUTO-BATCH] Parse errors:`, parseResult.errors);
      }
    } else if (docType === 'SETTLEMENT_DETAIL') {
      // Store settlement detail pages as fallback
      settlementDetailPages.push({ pageNumber: page.pageNumber, text: plainText });
    }
  }

  // Fallback: Try to extract metadata from SETTLEMENT_DETAIL if no REMITTANCE found
  if (!remittanceMetadata && settlementDetailPages.length > 0) {
    console.log(`[AUTO-BATCH] No REMITTANCE page found, attempting to extract metadata from SETTLEMENT_DETAIL pages`);
    
    for (const sdPage of settlementDetailPages) {
      const metadata = extractBatchMetadataFromSettlement(sdPage.text);
      if (metadata) {
        console.log(`[AUTO-BATCH] Successfully extracted metadata from SETTLEMENT_DETAIL page ${sdPage.pageNumber}`);
        remittanceMetadata = metadata;
        break;
      }
    }
  }

  if (!remittanceMetadata) {
    console.error('[AUTO-BATCH] Failed to parse batch metadata from any page');
    console.error('[AUTO-BATCH] Pages detected:');
    for (const page of pages) {
      const plainText = extractPlainText(page.text);
      const docType = detectDocumentType(plainText);
      console.error(`  Page ${page.pageNumber}: ${docType} (text length: ${plainText?.length || 0})`);
    }
    const firstPagePlain = extractPlainText(pages[0]?.text || '');
    console.error('[AUTO-BATCH] First page text sample:', firstPagePlain.substring(0, 800));
    throw new Error('Could not extract batch metadata from remittance or settlement detail page. Please ensure the PDF contains valid NVL settlement documents.');
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

  // Step 9: Automatically parse documents
  console.log(`[AUTO-BATCH] Starting automatic parsing for ${importFile.id}`);
  let parsingStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' = 'COMPLETED';
  let parsingErrors: string[] = [];

  try {
    const parseResult = await parseImportFile(prisma, importFile.id);
    parsingErrors = parseResult.errors;

    // Determine parsing status
    if (parseResult.totalLinesCreated === 0 && parsingErrors.length > 0) {
      parsingStatus = 'FAILED';
    } else if (parsingErrors.length > 0) {
      parsingStatus = 'PARTIAL';
    } else {
      parsingStatus = 'COMPLETED';
    }

    console.log(`[AUTO-BATCH] Parsing completed with status: ${parsingStatus}, lines: ${parseResult.totalLinesCreated}, errors: ${parsingErrors.length}`);
  } catch (error) {
    parsingStatus = 'FAILED';
    const errorMessage = error instanceof Error ? error.message : String(error);
    parsingErrors = [`Critical parsing error: ${errorMessage}`];
    console.error(`[AUTO-BATCH] Parsing failed critically:`, error);
    logger.error('Auto-batch parsing failed', {
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
