"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportIdParamSchema = exports.AdjustmentIdParamSchema = exports.CreateAdjustmentSchema = exports.UploadImportSchema = exports.BatchIdParamSchema = exports.GetBatchesQuerySchema = exports.CreateBatchSchema = void 0;
const zod_1 = require("zod");
exports.CreateBatchSchema = zod_1.z.object({
    agencyId: zod_1.z.string().uuid(),
    nvlPaymentRef: zod_1.z.string().min(1),
    weekStartDate: zod_1.z.string().datetime(),
    weekEndDate: zod_1.z.string().datetime(),
});
exports.GetBatchesQuerySchema = zod_1.z.object({
    agencyId: zod_1.z.string().uuid().optional(),
    status: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().int().positive().default(50),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
});
exports.BatchIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
exports.UploadImportSchema = zod_1.z.object({
    fileName: zod_1.z.string().min(1),
    fileContent: zod_1.z.string().min(1),
});
exports.CreateAdjustmentSchema = zod_1.z.object({
    targetTable: zod_1.z.string().min(1),
    targetRecordId: zod_1.z.string().uuid(),
    targetField: zod_1.z.string().min(1),
    adjustedValue: zod_1.z.string().min(1),
    reason: zod_1.z.string().min(10),
});
exports.AdjustmentIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
exports.ImportIdParamSchema = zod_1.z.object({
    importId: zod_1.z.string().uuid(),
});
//# sourceMappingURL=index.js.map