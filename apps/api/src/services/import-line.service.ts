import { PrismaClient } from '@prisma/client';
import { DocumentType } from '@settleflow/shared-types';
import { parseSettlementDetail } from '../parsers/nvl/settlement-detail.parser.js';
import { parseRevenueDistribution } from '../parsers/nvl/revenue-distribution.parser.js';
import { parseCreditDebit } from '../parsers/nvl/credit-debit.parser.js';
import { parseRemittance } from '../parsers/nvl/remittance.parser.js';

const prisma = new PrismaClient();

/**
 * Parse ISO date string (YYYY-MM-DD) to Date in local timezone
 * Avoids UTC offset issues by explicitly using local timezone
 */
function parseISODateLocal(dateStr: string): Date {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return new Date(dateStr);
  }
  const [, year, month, day] = match;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

export interface ParseDocumentResult {
  importDocumentId: string;
  linesCreated: number;
  errors: string[];
}

/**
 * Parse a single ImportDocument and create ImportLine records
 */
export async function parseAndSaveImportLines(
  importDocumentId: string
): Promise<ParseDocumentResult> {
  const errors: string[] = [];

  // Fetch the document with importFile relation (needed for batch lookup)
  const document = await prisma.importDocument.findUnique({
    where: { id: importDocumentId },
    include: { importFile: true },
  });

  if (!document) {
    throw new Error(`ImportDocument ${importDocumentId} not found`);
  }

  // Skip if already parsed
  if (document.parsedAt) {
    return {
      importDocumentId,
      linesCreated: 0,
      errors: [`Document already parsed at ${document.parsedAt}`],
    };
  }

  let linesCreated = 0;

  // Route to appropriate parser based on document type
  switch (document.documentType) {
    case DocumentType.SETTLEMENT_DETAIL: {
      const parseResult = parseSettlementDetail(document.rawText);
      errors.push(...parseResult.errors);

      // Get all Revenue Distribution documents in same batch (for linking)
      const revDistDocs = await prisma.importDocument.findMany({
        where: {
          importFile: {
            batchId: document.importFile?.batchId,
          },
          documentType: DocumentType.REVENUE_DISTRIBUTION,
          parsedAt: { not: null },
          metadata: { not: null },
        },
        include: {
          importFile: true,
        },
      });

      // Index Revenue Distribution data by Bill of Lading for quick lookup
      const revDistByBOL = new Map<string, any>();
      for (const revDoc of revDistDocs) {
        try {
          const metadata = JSON.parse(revDoc.metadata!);
          if (metadata.billOfLading) {
            revDistByBOL.set(metadata.billOfLading, metadata);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Create ImportLine records for each parsed line
      for (const line of parseResult.lines) {
        // For "RD REVENUE DISTR" lines, try to link with Revenue Distribution detail
        let revenueDistributionDetail = null;
        if (line.transactionCode === 'RD' && line.billOfLading) {
          revenueDistributionDetail = revDistByBOL.get(line.billOfLading) || null;
        }

        await prisma.importLine.create({
          data: {
            importDocumentId: document.id,
            driverId: null, // Will be matched later
            category: 'STLMT DET',
            lineType: line.lineType,
            description: line.description,
            amount: line.amount,
            date: line.date ? parseISODateLocal(line.date) : null,
            reference: line.referenceNumber || line.tripNumber,
            accountNumber: parseResult.accountNumber,
            tripNumber: line.tripNumber,
            billOfLading: line.billOfLading,
            rawData: JSON.stringify({
              billOfLading: line.billOfLading,
              tripNumber: line.tripNumber,
              referenceNumber: line.referenceNumber,
              transactionCode: line.transactionCode,
              rawLine: line.rawLine,
              accountNumber: parseResult.accountNumber,
              accountName: parseResult.accountName,
              checkNumber: parseResult.checkNumber,
              // Link to Revenue Distribution detail if available
              revenueDistributionDetail,
            }),
          },
        });
        linesCreated++;
      }

      // Mark document as parsed
      await prisma.importDocument.update({
        where: { id: document.id },
        data: { parsedAt: new Date() },
      });

      break;
    }

    case DocumentType.REVENUE_DISTRIBUTION: {
      // Revenue Distribution detail pages are supporting documentation only.
      // The actual transactions are already captured in the Settlement Detail page
      // as "RD REVENUE DISTR" line items. Creating import lines from these pages
      // would result in duplicate revenue entries.
      // 
      // Instead, we parse and store the detailed information in the document's
      // metadata field so it can be linked to Settlement Detail lines by B/L number.
      const parseResult = parseRevenueDistribution(document.rawText);
      errors.push(...parseResult.errors);

      // Store parsed data as document metadata (for linking to Settlement Detail)
      const metadata = parseResult.lines.length > 0 ? parseResult.lines[0] : null;
      
      await prisma.importDocument.update({
        where: { id: document.id },
        data: { 
          parsedAt: new Date(),
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });

      break;
    }

    case DocumentType.CREDIT_DEBIT: {
      const parseResult = parseCreditDebit(document.rawText);
      errors.push(...parseResult.errors);

      // Create ImportLine records for credit/debit
      for (const line of parseResult.lines) {
        // Parse date safely, handle invalid dates
        let lineDate: Date | null = null;
        try {
          if (line.processDate) {
            lineDate = new Date(line.processDate);
            // Validate date is reasonable (between 1900 and 2100)
            if (isNaN(lineDate.getTime()) || lineDate.getFullYear() < 1900 || lineDate.getFullYear() > 2100) {
              lineDate = null;
            }
          } else if (line.entryDate) {
            lineDate = new Date(line.entryDate);
            if (isNaN(lineDate.getTime()) || lineDate.getFullYear() < 1900 || lineDate.getFullYear() > 2100) {
              lineDate = null;
            }
          }
        } catch (e) {
          lineDate = null;
        }

        await prisma.importLine.create({
          data: {
            importDocumentId: document.id,
            driverId: null,
            category: 'CR/DB NOTIF',
            lineType: 'DEDUCTION',
            description: line.description,
            amount: line.amount,
            date: lineDate,
            reference: line.reference,
            accountNumber: line.accountNumber,
            rawData: JSON.stringify({
              transactionType: line.transactionType,
              isDebit: line.isDebit,
              entryDate: line.entryDate,
              processDate: line.processDate,
              accountNumber: line.accountNumber,
            }),
          },
        });
        linesCreated++;
      }

      if (linesCreated > 0) {
        await prisma.importDocument.update({
          where: { id: document.id },
          data: { parsedAt: new Date() },
        });
      }

      break;
    }

    case DocumentType.REMITTANCE: {
      const parseResult = parseRemittance(document.rawText);
      errors.push(...parseResult.errors);

      // Create ImportLine records for remittance (metadata, not transactions)
      for (const line of parseResult.lines) {
        await prisma.importLine.create({
          data: {
            importDocumentId: document.id,
            driverId: null,
            category: 'REMITTANCE',
            lineType: 'ETF',
            description: `Check ${line.checkNumber} - ${line.paymentMethod || 'Payment'}`,
            amount: line.checkAmount || 0,
            date: line.checkDate ? parseISODateLocal(line.checkDate) : null,
            reference: line.checkNumber,
            accountNumber: line.accountNumber,
            rawData: JSON.stringify({
              checkNumber: line.checkNumber,
              checkDate: line.checkDate,
              checkAmount: line.checkAmount,
              payeeName: line.payeeName,
              payeeAddress: line.payeeAddress,
              bankAccount: line.bankAccount,
              paymentMethod: line.paymentMethod,
              accountNumber: line.accountNumber,
            }),
          },
        });
        linesCreated++;
      }

      if (linesCreated > 0) {
        await prisma.importDocument.update({
          where: { id: document.id },
          data: { parsedAt: new Date() },
        });
      }

      break;
    }

    case DocumentType.ADVANCE_ADVICE:
      // Not yet implemented
      errors.push(`Parser for ${document.documentType} not yet implemented`);
      break;

    default:
      errors.push(`Unknown document type: ${document.documentType}`);
  }

  return {
    importDocumentId,
    linesCreated,
    errors,
  };
}

/**
 * Parse all documents in an ImportFile
 * Two-pass approach:
 * 1. First parse Revenue Distribution docs (to extract and store metadata)
 * 2. Then parse Settlement Detail docs (which can link to Revenue Distribution by B/L)
 */
export async function parseImportFile(importFileId: string): Promise<{
  importFileId: string;
  documentsProcessed: number;
  totalLinesCreated: number;
  errors: string[];
}> {
  const allErrors: string[] = [];
  let totalLinesCreated = 0;

  // Get all documents for this import file
  const documents = await prisma.importDocument.findMany({
    where: { importFileId },
    orderBy: { pageNumber: 'asc' },
  });

  // FIRST PASS: Parse Revenue Distribution documents to store metadata
  for (const document of documents) {
    if (document.documentType === DocumentType.REVENUE_DISTRIBUTION) {
      try {
        const result = await parseAndSaveImportLines(document.id);
        totalLinesCreated += result.linesCreated;
        allErrors.push(...result.errors);
      } catch (error) {
        allErrors.push(
          `Failed to parse Revenue Distribution document ${document.id} (page ${document.pageNumber}): ${error}`
        );
      }
    }
  }

  // SECOND PASS: Parse all other documents (Settlement Detail can now link to Revenue Distribution)
  for (const document of documents) {
    if (document.documentType !== DocumentType.REVENUE_DISTRIBUTION) {
      try {
        const result = await parseAndSaveImportLines(document.id);
        totalLinesCreated += result.linesCreated;
        allErrors.push(...result.errors);
      } catch (error) {
        allErrors.push(
          `Failed to parse document ${document.id} (page ${document.pageNumber}): ${error}`
        );
      }
    }
  }

  return {
    importFileId,
    documentsProcessed: documents.length,
    totalLinesCreated,
    errors: allErrors,
  };
}

/**
 * Get summary statistics for parsed import lines
 */
export async function getImportLineSummary(importFileId: string): Promise<{
  totalLines: number;
  byLineType: Record<string, number>;
  totalRevenue: number;
  totalAdvances: number;
  totalDeductions: number;
}> {
  const lines = await prisma.importLine.findMany({
    where: {
      importDocument: {
        importFileId,
      },
    },
  });

  const byLineType: Record<string, number> = {};
  let totalRevenue = 0;
  let totalAdvances = 0;
  let totalDeductions = 0;

  for (const line of lines) {
    // Count by line type
    byLineType[line.lineType] = (byLineType[line.lineType] || 0) + 1;

    // Sum by category
    if (line.lineType === 'REVENUE') {
      totalRevenue += Math.abs(line.amount); // Revenue is stored as negative
    } else if (line.lineType === 'ADVANCE') {
      totalAdvances += line.amount;
    } else if (line.lineType === 'DEDUCTION') {
      totalDeductions += line.amount;
    }
  }

  return {
    totalLines: lines.length,
    byLineType,
    totalRevenue,
    totalAdvances,
    totalDeductions,
  };
}
