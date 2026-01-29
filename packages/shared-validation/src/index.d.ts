import { z } from 'zod';
export declare const CreateBatchSchema: z.ZodObject<
  {
    agencyId: z.ZodString;
    nvlPaymentRef: z.ZodString;
    weekStartDate: z.ZodString;
    weekEndDate: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    agencyId: string;
    nvlPaymentRef: string;
    weekStartDate: string;
    weekEndDate: string;
  },
  {
    agencyId: string;
    nvlPaymentRef: string;
    weekStartDate: string;
    weekEndDate: string;
  }
>;
export declare const GetBatchesQuerySchema: z.ZodObject<
  {
    agencyId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
  },
  'strip',
  z.ZodTypeAny,
  {
    limit: number;
    offset: number;
    agencyId?: string | undefined;
    status?: string | undefined;
  },
  {
    agencyId?: string | undefined;
    status?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }
>;
export declare const BatchIdParamSchema: z.ZodObject<
  {
    id: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    id: string;
  },
  {
    id: string;
  }
>;
export declare const UploadImportSchema: z.ZodObject<
  {
    fileName: z.ZodString;
    fileContent: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    fileName: string;
    fileContent: string;
  },
  {
    fileName: string;
    fileContent: string;
  }
>;
export declare const CreateAdjustmentSchema: z.ZodObject<
  {
    targetTable: z.ZodString;
    targetRecordId: z.ZodString;
    targetField: z.ZodString;
    adjustedValue: z.ZodString;
    reason: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    targetTable: string;
    targetRecordId: string;
    targetField: string;
    adjustedValue: string;
    reason: string;
  },
  {
    targetTable: string;
    targetRecordId: string;
    targetField: string;
    adjustedValue: string;
    reason: string;
  }
>;
export declare const AdjustmentIdParamSchema: z.ZodObject<
  {
    id: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    id: string;
  },
  {
    id: string;
  }
>;
export declare const ImportIdParamSchema: z.ZodObject<
  {
    importId: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    importId: string;
  },
  {
    importId: string;
  }
>;
export type CreateBatchInput = z.infer<typeof CreateBatchSchema>;
export type GetBatchesQuery = z.infer<typeof GetBatchesQuerySchema>;
export type BatchIdParam = z.infer<typeof BatchIdParamSchema>;
export type UploadImportInput = z.infer<typeof UploadImportSchema>;
export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentSchema>;
export type AdjustmentIdParam = z.infer<typeof AdjustmentIdParamSchema>;
export type ImportIdParam = z.infer<typeof ImportIdParamSchema>;
//# sourceMappingURL=index.d.ts.map
