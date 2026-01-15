import { DocumentType } from '@settleflow/shared-types';

export function detectDocumentType(text: string): DocumentType {
  const upperText = text.toUpperCase();

  if (upperText.includes('REMITTANCE') || upperText.includes('PAYMENT ADVICE')) {
    return DocumentType.REMITTANCE;
  }

  if (upperText.includes('SETTLEMENT DETAIL') || upperText.includes('SETTLEMENT SUMMARY')) {
    return DocumentType.SETTLEMENT_DETAIL;
  }

  if (upperText.includes('REVENUE DISTRIBUTION') || upperText.includes('REVENUE SPLIT')) {
    // Skip summary pages - they don't contain transaction details
    if (upperText.includes('SUMMARY OF ITEMS')) {
      return DocumentType.UNKNOWN;
    }
    return DocumentType.REVENUE_DISTRIBUTION;
  }

  if (upperText.includes('ADVANCE ADVICE') || upperText.includes('ADVANCE CHARGEBACK') || upperText.includes('CASH ADVANCE')) {
    return DocumentType.ADVANCE_ADVICE;
  }

  if (upperText.includes('CREDIT') || upperText.includes('DEBIT') || upperText.includes('ADJUSTMENT')) {
    return DocumentType.CREDIT_DEBIT;
  }

  return DocumentType.UNKNOWN;
}
