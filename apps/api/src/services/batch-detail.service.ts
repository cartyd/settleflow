import { PrismaClient } from '@prisma/client';
import { captureCustomError } from '../utils/sentry.js';

export interface TripDetail {
  tripNumber: string;
  billOfLading: string;
  driverName: string;
  driverFirstName?: string;
  driverLastName?: string;
  shipperName?: string;
  origin?: string;
  destination?: string;
  deliveryDate?: string;
  weight?: string;
  miles?: string;
  serviceItems: ServiceItem[];
  netBalance: number;
  pageNumber: number;
  documentId: string;
}

export interface ServiceItem {
  description: string;
  revenueExpense?: string;
  percentageDue?: number;
  charges?: number;
  earnings?: number;
}

export interface BatchLineItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string | null;
  reference?: string | null;
  tripNumber?: string | null;
  billOfLading?: string | null;
  pageNumber: number;
  documentType: string;
  rawData?: string | null;
  // Parsed trip data for revenue distribution lines
  shipperName?: string;
  origin?: string;
  destination?: string;
  driverName?: string;
  driverFirstName?: string;
  driverLastName?: string;
  deliveryDate?: string;
}

export interface BatchDetailData {
  // Batch Summary
  id: string;
  nvlPaymentRef: string;
  status: string;
  weekStartDate: string;
  weekEndDate: string;
  netTotal: number;

  // Agency Info
  agencyName: string;
  agencyCode: string;

  // Document Info
  fileName: string;
  fileSize: number;
  pageCount: number;
  uploadedAt: string;
  lastParsedAt: string | null;
  parseErrors: string[];
  importFileId: string; // For reset/re-parse functionality

  // Financial Summary
  totalRevenue: number;
  totalAdvances: number;
  totalDeductions: number;

  // Line Items grouped by category
  lineItems: {
    revenueDistribution: BatchLineItem[];
    remittance: BatchLineItem[];
    advances: BatchLineItem[];
    creditDebit: BatchLineItem[];
    postingTicket: BatchLineItem[];
  };

  // Trip Details
  trips: TripDetail[];

  // PDF path for viewer
  pdfPath: string | null;
}

/**
 * Get comprehensive batch detail data including all import lines,
 * financial summaries, trip details, and document information.
 */
export async function getBatchDetailData(
  prisma: PrismaClient,
  batchId: string
): Promise<BatchDetailData> {
  // Fetch the batch with all related data
  const batch = await prisma.settlementBatch.findUnique({
    where: { id: batchId },
    include: {
      agency: {
        select: { name: true, code: true },
      },
      importFiles: {
        include: {
          importDocuments: {
            select: {
              id: true,
              pageNumber: true,
              documentType: true,
              parsedAt: true,
              importLines: {
                select: {
                  id: true,
                  lineType: true,
                  category: true,
                  description: true,
                  amount: true,
                  date: true,
                  reference: true,
                  tripNumber: true,
                  billOfLading: true,
                  rawData: true,
                },
              },
            },
            orderBy: { pageNumber: 'asc' },
          },
        },
      },
    },
  });

  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  // Aggregate document info
  const importFile = batch.importFiles[0]; // Assuming one file per batch for now
  if (!importFile) {
    throw new Error(`No import file found for batch ${batchId}`);
  }

  const documents = importFile.importDocuments;
  const pageCount = documents.length;
  const lastParsedAt =
    documents
      .map((d) => d.parsedAt)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

  // Collect parse errors (documents without parsedAt)
  const parseErrors = documents
    .filter((d) => !d.parsedAt && d.documentType !== 'UNKNOWN')
    .map((d) => `Page ${d.pageNumber} (${d.documentType}) not parsed`);

  // Flatten all import lines with document context
  const allLines = documents.flatMap((doc) =>
    doc.importLines.map((line) => ({
      ...line,
      pageNumber: doc.pageNumber,
      documentType: doc.documentType,
      documentId: doc.id,
    }))
  );

  // Calculate financial totals from import lines
  const revenueLines = allLines.filter((l) => l.lineType === 'REVENUE');
  const advanceLines = allLines.filter((l) => l.lineType === 'ADVANCE');
  const deductionLines = allLines.filter((l) => l.lineType === 'DEDUCTION');

  const totalRevenue = revenueLines.reduce((sum, l) => sum + Math.abs(l.amount), 0);
  const totalAdvances = advanceLines.reduce((sum, l) => sum + Math.abs(l.amount), 0);
  const totalDeductions = deductionLines.reduce((sum, l) => sum + Math.abs(l.amount), 0);
  const netTotal = totalRevenue - totalAdvances - totalDeductions;

  // Group lines by category
  const lineItems = {
    revenueDistribution: allLines
      .filter((l) => l.category === 'REV DIST')
      .map(formatLineItem),
    remittance: allLines
      .filter((l) => l.documentType === 'REMITTANCE')
      .map(formatLineItem),
    advances: advanceLines.map(formatLineItem),
    creditDebit: allLines
      .filter((l) => l.documentType === 'CREDIT_DEBIT')
      .map(formatLineItem),
    postingTicket: allLines
      .filter((l) => l.documentType === 'POSTING_TICKET')
      .map(formatLineItem),
  };

  // Extract trip details from Revenue Distribution lines
  const trips = extractTripDetails(revenueLines);

  // TODO: Get PDF path from file storage
  const pdfPath = null;

  return {
    id: batch.id,
    nvlPaymentRef: batch.nvlPaymentRef,
    status: batch.status,
    weekStartDate: batch.weekStartDate.toISOString(),
    weekEndDate: batch.weekEndDate.toISOString(),
    netTotal,

    agencyName: batch.agency.name,
    agencyCode: batch.agency.code,

    fileName: importFile.fileName,
    fileSize: importFile.fileSize,
    pageCount,
    uploadedAt: importFile.uploadedAt.toISOString(),
    lastParsedAt: lastParsedAt?.toISOString() || null,
    parseErrors,
    importFileId: importFile.id,

    totalRevenue,
    totalAdvances,
    totalDeductions,

    lineItems,
    trips,
    pdfPath,
  };
}

function formatLineItem(line: any): BatchLineItem {
  const item: BatchLineItem = {
    id: line.id,
    category: line.category || line.documentType,
    description: line.description,
    amount: line.amount,
    date: line.date ? line.date.toISOString() : null,
    reference: line.reference || null,
    tripNumber: line.tripNumber || null,
    billOfLading: line.billOfLading || null,
    pageNumber: line.pageNumber,
    documentType: line.documentType,
    rawData: line.rawData || null,
  };

  // Parse rawData for revenue distribution lines to include trip details
  if (line.rawData) {
    try {
      const rawData = JSON.parse(line.rawData);
      item.shipperName = rawData.shipperName;
      item.origin = rawData.origin;
      item.destination = rawData.destination;
      item.driverName = rawData.driverName;
      item.driverFirstName = rawData.driverFirstName;
      item.driverLastName = rawData.driverLastName;
      item.deliveryDate = rawData.deliveryDate;
    } catch (e) {
      // Ignore parsing errors
    }
  }

  return item;
}

function extractTripDetails(revenueLines: any[]): TripDetail[] {
  const trips: TripDetail[] = [];

  for (const line of revenueLines) {
    try {
      const rawData = JSON.parse(line.rawData);
      
      // Only include lines that have trip details (Revenue Distribution)
      if (!rawData.tripNumber) {
        continue;
      }

      trips.push({
        tripNumber: rawData.tripNumber || 'Unknown',
        billOfLading: rawData.billOfLading || '',
        driverName: rawData.driverName || 'Unknown Driver',
        driverFirstName: rawData.driverFirstName,
        driverLastName: rawData.driverLastName,
        shipperName: rawData.shipperName,
        origin: rawData.origin,
        destination: rawData.destination,
        deliveryDate: rawData.deliveryDate,
        weight: rawData.weight,
        miles: rawData.miles,
        serviceItems: rawData.serviceItems || [],
        netBalance: rawData.netBalance || 0,
        pageNumber: line.pageNumber,
        documentId: line.documentId,
      });
    } catch (e) {
      console.error(`Failed to parse rawData for line ${line.id}:`, e);
      captureCustomError(e as Error, {
        level: 'warning',
        tags: {
          module: 'batch-detail',
          operation: 'extract_trip_details',
        },
        extra: {
          lineId: line.id,
          rawData: line.rawData,
        },
      });
    }
  }

  return trips;
}
