export var SettlementStatus;
(function (SettlementStatus) {
    SettlementStatus["CREATED"] = "CREATED";
    SettlementStatus["IMPORTED"] = "IMPORTED";
    SettlementStatus["VALIDATED"] = "VALIDATED";
    SettlementStatus["IMPORT_APPROVED"] = "IMPORT_APPROVED";
    SettlementStatus["LOCKED"] = "LOCKED";
    SettlementStatus["FUNDS_CLEARED"] = "FUNDS_CLEARED";
    SettlementStatus["PAID"] = "PAID";
})(SettlementStatus || (SettlementStatus = {}));
export var DocumentType;
(function (DocumentType) {
    DocumentType["REMITTANCE"] = "REMITTANCE";
    DocumentType["SETTLEMENT_DETAIL"] = "SETTLEMENT_DETAIL";
    DocumentType["REVENUE_DISTRIBUTION"] = "REVENUE_DISTRIBUTION";
    DocumentType["ADVANCE_ADVICE"] = "ADVANCE_ADVICE";
    DocumentType["CREDIT_DEBIT"] = "CREDIT_DEBIT";
    DocumentType["POSTING_TICKET"] = "POSTING_TICKET";
    DocumentType["UNKNOWN"] = "UNKNOWN";
})(DocumentType || (DocumentType = {}));
export var DriverRequestStatus;
(function (DriverRequestStatus) {
    DriverRequestStatus["PENDING"] = "PENDING";
    DriverRequestStatus["APPROVED"] = "APPROVED";
    DriverRequestStatus["REJECTED"] = "REJECTED";
    DriverRequestStatus["MATCHED"] = "MATCHED";
})(DriverRequestStatus || (DriverRequestStatus = {}));
export var AdjustmentStatus;
(function (AdjustmentStatus) {
    AdjustmentStatus["PENDING"] = "PENDING";
    AdjustmentStatus["APPROVED"] = "APPROVED";
    AdjustmentStatus["REJECTED"] = "REJECTED";
})(AdjustmentStatus || (AdjustmentStatus = {}));
export var AuditAction;
(function (AuditAction) {
    AuditAction["BATCH_CREATED"] = "BATCH_CREATED";
    AuditAction["IMPORT_UPLOADED"] = "IMPORT_UPLOADED";
    AuditAction["IMPORT_APPROVED"] = "IMPORT_APPROVED";
    AuditAction["BATCH_LOCKED"] = "BATCH_LOCKED";
    AuditAction["FUNDS_CLEARED"] = "FUNDS_CLEARED";
    AuditAction["BATCH_PAID"] = "BATCH_PAID";
    AuditAction["ADJUSTMENT_CREATED"] = "ADJUSTMENT_CREATED";
    AuditAction["ADJUSTMENT_APPROVED"] = "ADJUSTMENT_APPROVED";
    AuditAction["ADJUSTMENT_REJECTED"] = "ADJUSTMENT_REJECTED";
})(AuditAction || (AuditAction = {}));
//# sourceMappingURL=enums.js.map