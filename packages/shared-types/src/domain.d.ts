import { SettlementStatus, DocumentType, DriverRequestStatus, AdjustmentStatus, AuditAction } from './enums';
export interface Agency {
    id: string;
    name: string;
    code: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface Driver {
    id: string;
    agencyId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface SettlementBatch {
    id: string;
    agencyId: string;
    nvlPaymentRef: string;
    status: SettlementStatus;
    weekStartDate: Date;
    weekEndDate: Date;
    totalRevenue: number;
    totalAdvances: number;
    totalDeductions: number;
    netAmount: number;
    createdAt: Date;
    updatedAt: Date;
    lockedAt?: Date;
    fundsClearedAt?: Date;
    paidAt?: Date;
}
export interface ImportFile {
    id: string;
    batchId: string;
    fileName: string;
    fileSize: number;
    uploadedAt: Date;
    approvedAt?: Date;
    approvedBy?: string;
}
export interface ImportDocument {
    id: string;
    importFileId: string;
    documentType: DocumentType;
    pageNumber: number;
    rawText: string;
    parsedAt?: Date;
}
export interface ImportLine {
    id: string;
    importDocumentId: string;
    driverId?: string;
    lineType: string;
    description: string;
    amount: number;
    date?: Date;
    reference?: string;
    rawData: Record<string, unknown>;
    createdAt: Date;
}
export interface RevenueDistribution {
    id: string;
    batchId: string;
    driverId: string;
    importLineId?: string;
    grossRevenue: number;
    commission: number;
    netRevenue: number;
    createdAt: Date;
}
export interface Advance {
    id: string;
    batchId: string;
    driverId: string;
    importLineId?: string;
    amount: number;
    date: Date;
    reference?: string;
    description?: string;
    createdAt: Date;
}
export interface Deduction {
    id: string;
    batchId: string;
    driverId: string;
    importLineId?: string;
    category: string;
    amount: number;
    date: Date;
    reference?: string;
    description?: string;
    createdAt: Date;
}
export interface DriverRequest {
    id: string;
    batchId: string;
    driverId: string;
    requestType: string;
    amount: number;
    description?: string;
    status: DriverRequestStatus;
    submittedAt: Date;
    reviewedAt?: Date;
    reviewedBy?: string;
    reviewNotes?: string;
}
export interface Adjustment {
    id: string;
    batchId: string;
    targetTable: string;
    targetRecordId: string;
    targetField: string;
    originalValue: string;
    adjustedValue: string;
    reason: string;
    status: AdjustmentStatus;
    createdBy: string;
    createdAt: Date;
    approvedBy?: string;
    approvedAt?: Date;
    rejectedBy?: string;
    rejectedAt?: Date;
    rejectionReason?: string;
}
export interface AuditLog {
    id: string;
    batchId: string;
    action: AuditAction;
    performedBy: string;
    performedAt: Date;
    beforeSnapshot?: Record<string, unknown>;
    afterSnapshot?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=domain.d.ts.map