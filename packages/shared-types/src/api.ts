import { SettlementStatus, DocumentType } from './enums';

export interface CreateBatchRequest {
  agencyId: string;
  nvlPaymentRef: string;
  weekStartDate: string;
  weekEndDate: string;
}

export interface CreateBatchResponse {
  id: string;
  status: SettlementStatus;
  createdAt: string;
}

export interface GetBatchesResponse {
  batches: BatchSummary[];
  total: number;
}

export interface BatchSummary {
  id: string;
  agencyId: string;
  agencyName: string;
  nvlPaymentRef: string;
  status: SettlementStatus;
  weekStartDate: string;
  weekEndDate: string;
  totalRevenue: number;
  netAmount: number;
  createdAt: string;
}

export interface GetBatchDetailResponse {
  id: string;
  agencyId: string;
  agencyName: string;
  nvlPaymentRef: string;
  status: SettlementStatus;
  weekStartDate: string;
  weekEndDate: string;
  totalRevenue: number;
  totalAdvances: number;
  totalDeductions: number;
  netAmount: number;
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
  fundsClearedAt?: string;
  paidAt?: string;
  imports: ImportFileSummary[];
  drivers: DriverSettlement[];
}

export interface ImportFileSummary {
  id: string;
  fileName: string;
  uploadedAt: string;
  approvedAt?: string;
  documentCount: number;
}

export interface DriverSettlement {
  driverId: string;
  driverName: string;
  grossRevenue: number;
  advances: number;
  deductions: number;
  adjustments: number;
  netAmount: number;
}

export interface UploadImportRequest {
  fileName: string;
  fileContent: string;
}

export interface UploadImportResponse {
  importId: string;
  documentsDetected: number;
  linesProcessed: number;
}

export interface ApproveImportResponse {
  success: boolean;
  batchStatus: SettlementStatus;
}

export interface LockBatchResponse {
  success: boolean;
  lockedAt: string;
}

export interface FundsClearResponse {
  success: boolean;
  clearedAt: string;
}

export interface BatchPreview {
  batchId: string;
  status: SettlementStatus;
  weekStartDate: string;
  weekEndDate: string;
  drivers: DriverPreview[];
  totals: {
    grossRevenue: number;
    totalAdvances: number;
    totalDeductions: number;
    totalAdjustments: number;
    netAmount: number;
  };
}

export interface DriverPreview {
  driverId: string;
  driverName: string;
  revenue: {
    gross: number;
    commission: number;
    net: number;
  };
  advances: AdvanceDetail[];
  deductions: DeductionDetail[];
  adjustments: AdjustmentDetail[];
  netAmount: number;
}

export interface AdvanceDetail {
  id: string;
  amount: number;
  date: string;
  reference?: string;
  description?: string;
}

export interface DeductionDetail {
  id: string;
  category: string;
  amount: number;
  date: string;
  reference?: string;
  description?: string;
}

export interface AdjustmentDetail {
  id: string;
  targetField: string;
  originalValue: string;
  adjustedValue: string;
  reason: string;
  approvedAt?: string;
}

export interface CreateAdjustmentRequest {
  targetTable: string;
  targetRecordId: string;
  targetField: string;
  adjustedValue: string;
  reason: string;
}

export interface CreateAdjustmentResponse {
  id: string;
  status: string;
}

export interface ApproveAdjustmentResponse {
  success: boolean;
  approvedAt: string;
}

export interface GetAuditLogResponse {
  logs: AuditLogEntry[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  performedBy: string;
  performedAt: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}
