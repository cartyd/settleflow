import { PrismaClient } from '@prisma/client';
import { DocumentType } from '@settleflow/shared-types';
import { parseSettlementDetail } from '../parsers/nvl/settlement-detail.parser.js';
import { parseRevenueDistribution } from '../parsers/nvl/revenue-distribution.parser.js';
import { parseCreditDebit } from '../parsers/nvl/credit-debit.parser.js';
import { parseRemittance } from '../parsers/nvl/remittance.parser.js';
import { parseAdvance } from '../parsers/nvl/advance.parser.js';
import { parsePostingTicket } from '../parsers/nvl/posting-ticket.parser.js';

/**
 * Extract plain text from rawText field, handling both plain text and JSON formats.
 * Some older documents have JSON format from Gemini: [{"page_number": 1, "text_content": "..."}]
 */
export function extractPlainText(rawText: string): string {
  // Remove markdown code fences if present (Gemini sometimes wraps JSON in ```json)
  let cleanedText = rawText;
  if (cleanedText.trimStart().startsWith('```')) {
    cleanedText = cleanedText.replace(/^```[a-z]*\s*\n/, '').replace(/\n```\s*$/, '');
  }
  
  // Try to parse as JSON first
  if (cleanedText.trimStart().startsWith('[') || cleanedText.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(cleanedText);
      
      // Handle array format: [{"page_number": 1, "text_content": "..."}]
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Concatenate all text_content fields
        return parsed
          .map(page => page.text_content || '')
          .join('\n')
          .trim();
      }
      
      // Handle single object format: {"page_number": 1, "text_content": "..."}
      if (parsed.text_content) {
        return parsed.text_content.trim();
      }
    } catch (e) {
      // Not valid JSON, treat as plain text
    }
  }
  
  // Return as-is if not JSON
  return cleanedText;
}

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
  prisma: PrismaClient,
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
      // Settlement Detail is a VALIDATION document, not the primary source.
      // It contains a summary of transactions that should match the detail from
      // supporting documents (Revenue Distribution, Credit/Debit, etc.).
      const plainText = extractPlainText(document.rawText);
      const parseResult = parseSettlementDetail(plainText);
      errors.push(...parseResult.errors);

      // Get all import lines already created from supporting documents in this batch
      const existingLines = await prisma.importLine.findMany({
        where: {
          importDocument: {
            importFile: {
              batchId: document.importFile?.batchId,
            },
          },
        },
      });

      // Validate that Settlement Detail matches existing import lines
      for (const settlementLine of parseResult.lines) {
        let matched = false;

        // Match RD (Revenue Distribution) lines by B/L
        if (settlementLine.transactionCode === 'RD' && settlementLine.billOfLading) {
          const matchingLine = existingLines.find(
            (el) => el.lineType === 'REVENUE' && el.billOfLading === settlementLine.billOfLading
          );
          
          if (matchingLine) {
            matched = true;
            // Validate amounts match (within 0.01 tolerance for rounding)
            if (Math.abs(Math.abs(matchingLine.amount) - Math.abs(settlementLine.amount)) > 0.01) {
              errors.push(
                `Revenue mismatch for B/L ${settlementLine.billOfLading}: ` +
                `Settlement Detail shows $${Math.abs(settlementLine.amount).toFixed(2)}, ` +
                `but Revenue Distribution shows $${Math.abs(matchingLine.amount).toFixed(2)}`
              );
            }
          } else {
            errors.push(
              `Settlement Detail references Revenue Distribution B/L ${settlementLine.billOfLading}, ` +
              `but no matching Revenue Distribution document was found`
            );
          }
        }
        
        // Match MC (Miscellaneous Charge) lines by description and amount
        else if (settlementLine.transactionCode === 'MC') {
          const matchingLine = existingLines.find(
            (el) =>
              el.lineType === 'DEDUCTION' &&
              el.description.toUpperCase().includes(settlementLine.description.toUpperCase()) &&
              Math.abs(el.amount - settlementLine.amount) < 0.01
          );
          
          if (matchingLine) {
            matched = true;
          } else {
            errors.push(
              `Settlement Detail shows MC deduction "${settlementLine.description}" ($${settlementLine.amount}), ` +
              `but no matching Credit/Debit document was found`
            );
          }
        }
        
        // Match CM (Comdata/Advance) lines
        else if (settlementLine.transactionCode === 'CM') {
          const matchingLine = existingLines.find(
            (el) =>
              el.lineType === 'ADVANCE' &&
              Math.abs(el.amount - settlementLine.amount) < 0.01 &&
              el.tripNumber === settlementLine.tripNumber
          );
          
          if (matchingLine) {
            matched = true;
          } else {
            // This is expected - CM advances might not have supporting docs
            // Just note it, don't error
          }
        }
        
        // Match PT (Posting Ticket) lines
        else if (settlementLine.transactionCode === 'PT') {
          // PT lines might not have supporting docs either
          matched = true; // Accept as-is for now
        }
      }

      // Mark document as parsed (validation complete)
      await prisma.importDocument.update({
        where: { id: document.id },
        data: { parsedAt: new Date() },
      });

      break;
    }

    case DocumentType.REVENUE_DISTRIBUTION: {
      // Revenue Distribution pages are the PRIMARY source for revenue transactions.
      // They contain full trip details: driver, route, service breakdown, net balance.
      const plainText = extractPlainText(document.rawText);
      const parseResult = parseRevenueDistribution(plainText);
      errors.push(...parseResult.errors);

      // Create ImportLine records for revenue distribution
      for (const line of parseResult.lines) {
        // Format description as "SHIPPER: ORIGIN → DESTINATION"
        const shipper = line.shipperName || 'Unknown';
        const origin = line.origin || 'Unknown';
        const destination = line.destination || 'Unknown';
        const description = `${shipper}: ${origin} → ${destination}`;
        
        await prisma.importLine.create({
          data: {
            importDocumentId: document.id,
            driverId: null, // Will be matched later
            category: 'REV DIST',
            lineType: 'REVENUE',
            description,
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

      // Mark as parsed (even if 0 lines created)
      await prisma.importDocument.update({
        where: { id: document.id },
        data: { parsedAt: new Date() },
      });

      break;
    }

    case DocumentType.CREDIT_DEBIT: {
      // Credit/Debit Notification pages are the PRIMARY source for deduction transactions.
      // They contain full deduction details: transaction type, dates, amounts.
      const plainText = extractPlainText(document.rawText);
      const parseResult = parseCreditDebit(plainText);
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

      // Mark as parsed (even if 0 lines created, to avoid "not parsed" errors)
      await prisma.importDocument.update({
        where: { id: document.id },
        data: { parsedAt: new Date() },
      });

      break;
    }

    case DocumentType.REMITTANCE: {
      const plainText = extractPlainText(document.rawText);
      const parseResult = parseRemittance(plainText);
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

      // Mark as parsed (even if 0 lines created)
      await prisma.importDocument.update({
        where: { id: document.id },
        data: { parsedAt: new Date() },
      });

      break;
    }

    case DocumentType.ADVANCE_ADVICE: {
      // Advance Advice pages are the PRIMARY source for advance/comdata transactions.
      const plainText = extractPlainText(document.rawText);
      const parseResult = parseAdvance(plainText);
      errors.push(...parseResult.errors);

      // Create ImportLine records for advances
      for (const line of parseResult.lines) {
        await prisma.importLine.create({
          data: {
            importDocumentId: document.id,
            driverId: null,
            category: 'ADVANCE',
            lineType: 'ADVANCE',
            description: line.description || 'COMDATA',
            amount: line.advanceAmount,
            date: line.date ? parseISODateLocal(line.date) : null,
            reference: line.tripNumber,
            accountNumber: line.accountNumber,
            tripNumber: line.tripNumber,
            rawData: JSON.stringify({
              tripNumber: line.tripNumber,
              accountNumber: line.accountNumber,
              driverName: line.driverName,
              advanceAmount: line.advanceAmount,
              description: line.description,
            }),
          },
        });
        linesCreated++;
      }

      // Mark as parsed (even if 0 lines created)
      await prisma.importDocument.update({
        where: { id: document.id },
        data: { parsedAt: new Date() },
      });

      break;
    }

    case DocumentType.POSTING_TICKET: {
      // Posting Ticket pages are the PRIMARY source for posting ticket deductions.
      const plainText = extractPlainText(document.rawText);
      const parseResult = parsePostingTicket(plainText);
      errors.push(...parseResult.errors);

      // Create ImportLine records for posting tickets
      for (const line of parseResult.lines) {
        await prisma.importLine.create({
          data: {
            importDocumentId: document.id,
            driverId: null,
            category: 'POSTING TICKET',
            lineType: 'DEDUCTION',
            description: line.description || 'OTHER CHARGES',
            amount: line.debitAmount,
            date: line.date ? parseISODateLocal(line.date) : null,
            reference: line.ptNumber,
            accountNumber: line.accountNumber,
            rawData: JSON.stringify({
              ptNumber: line.ptNumber,
              accountNumber: line.accountNumber,
              debitAmount: line.debitAmount,
              description: line.description,
            }),
          },
        });
        linesCreated++;
      }

      // Mark as parsed (even if 0 lines created)
      await prisma.importDocument.update({
        where: { id: document.id },
        data: { parsedAt: new Date() },
      });

      break;
    }

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
 * 1. First parse supporting documents (Revenue Distribution, Credit/Debit, Advance) to create import lines
 * 2. Then parse Settlement Detail as validation (cross-check totals and flag discrepancies)
 */
export async function parseImportFile(
  prisma: PrismaClient,
  importFileId: string
): Promise<{
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

  // FIRST PASS: Parse supporting documents to create import lines
  // These are the PRIMARY source of transaction data
  for (const document of documents) {
    if (
      document.documentType === DocumentType.REVENUE_DISTRIBUTION ||
      document.documentType === DocumentType.CREDIT_DEBIT ||
      document.documentType === DocumentType.ADVANCE_ADVICE ||
      document.documentType === DocumentType.POSTING_TICKET
    ) {
      try {
        const result = await parseAndSaveImportLines(prisma, document.id);
        totalLinesCreated += result.linesCreated;
        allErrors.push(...result.errors);
      } catch (error) {
        allErrors.push(
          `Failed to parse ${document.documentType} document ${document.id} (page ${document.pageNumber}): ${error}`
        );
      }
    }
  }

  // SECOND PASS: Parse validation documents (Settlement Detail, Remittance)
  // Settlement Detail validates that supporting docs match the summary
  for (const document of documents) {
    if (
      document.documentType === DocumentType.SETTLEMENT_DETAIL ||
      document.documentType === DocumentType.REMITTANCE ||
      document.documentType === DocumentType.UNKNOWN
    ) {
      try {
        const result = await parseAndSaveImportLines(prisma, document.id);
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
export async function getImportLineSummary(
  prisma: PrismaClient,
  importFileId: string
): Promise<{
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
