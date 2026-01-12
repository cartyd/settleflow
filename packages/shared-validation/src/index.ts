import { z } from 'zod';

export const CreateBatchSchema = z.object({
  agencyId: z.string().uuid(),
  nvlPaymentRef: z.string().min(1),
  weekStartDate: z.string().datetime(),
  weekEndDate: z.string().datetime(),
});

export const GetBatchesQuerySchema = z.object({
  agencyId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const BatchIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const UploadImportSchema = z.object({
  fileName: z.string().min(1),
  fileContent: z.string().min(1),
});

export const CreateAdjustmentSchema = z.object({
  targetTable: z.string().min(1),
  targetRecordId: z.string().uuid(),
  targetField: z.string().min(1),
  adjustedValue: z.string().min(1),
  reason: z.string().min(10),
});

export const AdjustmentIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ImportIdParamSchema = z.object({
  importId: z.string().uuid(),
});

export type CreateBatchInput = z.infer<typeof CreateBatchSchema>;
export type GetBatchesQuery = z.infer<typeof GetBatchesQuerySchema>;
export type BatchIdParam = z.infer<typeof BatchIdParamSchema>;
export type UploadImportInput = z.infer<typeof UploadImportSchema>;
export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentSchema>;
export type AdjustmentIdParam = z.infer<typeof AdjustmentIdParamSchema>;
export type ImportIdParam = z.infer<typeof ImportIdParamSchema>;
