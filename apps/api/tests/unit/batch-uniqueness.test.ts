import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBatch } from '../../src/services/batch.service';
import { SettlementStatus } from '@settleflow/shared-types';

describe('Batch Uniqueness Constraint', () => {
  const mockPrisma = {
    settlementBatch: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a new batch when NVL payment ref is unique', async () => {
    mockPrisma.settlementBatch.findUnique.mockResolvedValue(null);
    mockPrisma.settlementBatch.create.mockResolvedValue({
      id: 'batch-1',
      agencyId: 'agency-1',
      nvlPaymentRef: 'CHECK-001',
      status: SettlementStatus.CREATED,
      createdAt: new Date(),
    });

    const result = await createBatch(
      mockPrisma,
      {
        agencyId: 'agency-1',
        nvlPaymentRef: 'CHECK-001',
        weekStartDate: '2024-01-01T00:00:00Z',
        weekEndDate: '2024-01-07T23:59:59Z',
      },
      'user-1'
    );

    expect(result.id).toBe('batch-1');
    expect(mockPrisma.settlementBatch.create).toHaveBeenCalledTimes(1);
  });

  it('should throw error when NVL payment ref already exists for agency', async () => {
    mockPrisma.settlementBatch.findUnique.mockResolvedValue({
      id: 'existing-batch',
      agencyId: 'agency-1',
      nvlPaymentRef: 'CHECK-001',
    });

    await expect(
      createBatch(
        mockPrisma,
        {
          agencyId: 'agency-1',
          nvlPaymentRef: 'CHECK-001',
          weekStartDate: '2024-01-01T00:00:00Z',
          weekEndDate: '2024-01-07T23:59:59Z',
        },
        'user-1'
      )
    ).rejects.toThrow('Batch with this NVL payment reference already exists for this agency');
  });

  it('should allow same NVL payment ref for different agencies', async () => {
    mockPrisma.settlementBatch.findUnique.mockResolvedValue(null);
    mockPrisma.settlementBatch.create.mockResolvedValue({
      id: 'batch-2',
      agencyId: 'agency-2',
      nvlPaymentRef: 'CHECK-001',
      status: SettlementStatus.CREATED,
      createdAt: new Date(),
    });

    const result = await createBatch(
      mockPrisma,
      {
        agencyId: 'agency-2',
        nvlPaymentRef: 'CHECK-001',
        weekStartDate: '2024-01-01T00:00:00Z',
        weekEndDate: '2024-01-07T23:59:59Z',
      },
      'user-1'
    );

    expect(result.agencyId).toBe('agency-2');
  });
});
