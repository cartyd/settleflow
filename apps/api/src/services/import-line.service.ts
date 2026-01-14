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

  // Fetch the document
  const document = await prisma.importDocument.findUnique({
    where: { id: importDocumentId },
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

      // Create ImportLine records for each parsed line
      for (const line of parseResult.lines) {
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
      const parseResult = await parseRevenueDistribution(document.rawText);
      errors.push(...parseResult.errors);

      // Create ImportLine records for revenue distribution
      for (const line of parseResult.lines) {
        await prisma.importLine.create({
          data: {
            importDocumentId: document.id,
            driverId: null, // Will be matched later
            category: 'REV DIST',
            lineType: 'REVENUE',
            description: `Trip ${line.tripNumber} - ${line.origin} to ${line.destination}`,
            amount: -Math.abs(line.netBalance), // Revenue is negative (owed to driver)
            date: line.entryDate ? parseISODateLocal(line.entryDate) : null,
            reference: line.tripNumber,
            accountNumber: line.accountNumber,
            tripNumber: line.tripNumber,
            billOfLading: line.billOfLading,
            rawData: JSON.stringify({
              driverName: line.driverName,
              driverFirstName: line.driverFirstName,
              driverLastName: line.driverLastName,
              accountNumber: line.accountNumber,
              tripNumber: line.tripNumber,
              billOfLading: line.billOfLading,
              shipperName: line.shipperName,
              entryDate: line.entryDate,
              origin: line.origin,
              destination: line.destination,
              deliveryDate: line.deliveryDate,
              weight: line.weight,
              miles: line.miles,
              overflowWeight: line.overflowWeight,
              serviceItems: line.serviceItems,
              netBalance: line.netBalance,
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

    case DocumentType.CREDIT_DEBIT: {
      const parseResult = await parseCreditDebit(document.rawText);
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
      const parseResult = await parseRemittance(document.rawText);
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

  for (const document of documents) {
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
