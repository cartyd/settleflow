import { DocumentType } from '@settleflow/shared-types';

export function detectDocumentType(text: string): DocumentType {
  const upperText = text.toUpperCase();

  if (upperText.includes('REMITTANCE') || upperText.includes('PAYMENT ADVICE')) {
    return DocumentType.REMITTANCE;
  }

  // Check for Settlement Detail first - it often contains "REVENUE DISTR" in transaction list
  // which would incorrectly match REVENUE_DISTRIBUTION
  if (
    upperText.includes('SETTLEMENT DETAIL') ||
    upperText.includes('SETTLEMENT SUMMARY') ||
    (upperText.includes('THE FOLLOWING ITEMS') && upperText.includes('PAID WITH CHECK'))
  ) {
    return DocumentType.SETTLEMENT_DETAIL;
  }

  // Check for REVENUE DISTRIBUTION with specific markers
  // This must come before CREDIT/DEBIT check to avoid misclassification
  // Revenue distribution pages have specific headers like "FOR SERVICE PERFORMED BY",
  // "BILL OF LADING", "SHIPPER NAME", "ORIGIN", "DESTINATION"
  const hasRevenueDistributionMarkers =
    upperText.includes('FOR SERVICE PERFORMED BY') ||
    (upperText.includes('BILL OF LADING') && upperText.includes('SHIPPER')) ||
    (upperText.includes('ORIGIN') && upperText.includes('DESTINATION') && upperText.includes('SHIPPER'));

  if (
    upperText.includes('REVENUE DISTRIBUTION') ||
    upperText.includes('REVENUE SPLIT') ||
    hasRevenueDistributionMarkers
  ) {
    // Skip summary pages - they don't contain transaction details
    if (upperText.includes('SUMMARY OF ITEMS')) {
      return DocumentType.UNKNOWN;
    }
    return DocumentType.REVENUE_DISTRIBUTION;
  }

  if (upperText.includes('POSTING TICKET') || upperText.includes('PT NUMBER')) {
    return DocumentType.POSTING_TICKET;
  }

  if (upperText.includes('ADVANCE') && (upperText.includes('CHARGEBACK') || upperText.includes('REQUEST FOR ADVANCE'))) {
    return DocumentType.ADVANCE_ADVICE;
  }

  if (upperText.includes('CREDIT') || upperText.includes('DEBIT') || upperText.includes('ADJUSTMENT')) {
    return DocumentType.CREDIT_DEBIT;
  }

  return DocumentType.UNKNOWN;
}
