"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditAction = exports.AdjustmentStatus = exports.DriverRequestStatus = exports.DocumentType = exports.SettlementStatus = void 0;
var SettlementStatus;
(function (SettlementStatus) {
    SettlementStatus["CREATED"] = "CREATED";
    SettlementStatus["IMPORTED"] = "IMPORTED";
    SettlementStatus["VALIDATED"] = "VALIDATED";
    SettlementStatus["IMPORT_APPROVED"] = "IMPORT_APPROVED";
    SettlementStatus["LOCKED"] = "LOCKED";
    SettlementStatus["FUNDS_CLEARED"] = "FUNDS_CLEARED";
    SettlementStatus["PAID"] = "PAID";
})(SettlementStatus || (exports.SettlementStatus = SettlementStatus = {}));
var DocumentType;
(function (DocumentType) {
    DocumentType["REMITTANCE"] = "REMITTANCE";
    DocumentType["SETTLEMENT_DETAIL"] = "SETTLEMENT_DETAIL";
    DocumentType["REVENUE_DISTRIBUTION"] = "REVENUE_DISTRIBUTION";
    DocumentType["ADVANCE_ADVICE"] = "ADVANCE_ADVICE";
    DocumentType["CREDIT_DEBIT"] = "CREDIT_DEBIT";
    DocumentType["UNKNOWN"] = "UNKNOWN";
})(DocumentType || (exports.DocumentType = DocumentType = {}));
var DriverRequestStatus;
(function (DriverRequestStatus) {
    DriverRequestStatus["PENDING"] = "PENDING";
    DriverRequestStatus["APPROVED"] = "APPROVED";
    DriverRequestStatus["REJECTED"] = "REJECTED";
    DriverRequestStatus["MATCHED"] = "MATCHED";
})(DriverRequestStatus || (exports.DriverRequestStatus = DriverRequestStatus = {}));
var AdjustmentStatus;
(function (AdjustmentStatus) {
    AdjustmentStatus["PENDING"] = "PENDING";
    AdjustmentStatus["APPROVED"] = "APPROVED";
    AdjustmentStatus["REJECTED"] = "REJECTED";
})(AdjustmentStatus || (exports.AdjustmentStatus = AdjustmentStatus = {}));
var AuditAction;
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
})(AuditAction || (exports.AuditAction = AuditAction = {}));
//# sourceMappingURL=enums.js.map