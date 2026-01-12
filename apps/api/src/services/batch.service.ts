import { PrismaClient } from '@prisma/client';
import { SettlementStatus } from '@settleflow/shared-types';
import { CreateBatchRequest } from '@settleflow/shared-types';

export async function createBatch(prisma: PrismaClient, data: CreateBatchRequest, userId: string) {
  const existing = await prisma.settlementBatch.findUnique({
    where: {
      agencyId_nvlPaymentRef: {
        agencyId: data.agencyId,
        nvlPaymentRef: data.nvlPaymentRef,
      },
    },
  });

  if (existing) {
    throw new Error('Batch with this NVL payment reference already exists for this agency');
  }

  const batch = await prisma.settlementBatch.create({
    data: {
      agencyId: data.agencyId,
      nvlPaymentRef: data.nvlPaymentRef,
      weekStartDate: new Date(data.weekStartDate),
      weekEndDate: new Date(data.weekEndDate),
      status: SettlementStatus.CREATED,
    },
  });

  await prisma.auditLog.create({
    data: {
      batchId: batch.id,
      action: 'BATCH_CREATED',
      performedBy: userId,
      afterSnapshot: JSON.stringify(batch),
    },
  });

  return batch;
}

export async function getBatches(
  prisma: PrismaClient,
  filters: { agencyId?: string; status?: string; limit: number; offset: number }
) {
  const where: any = {};
  if (filters.agencyId) where.agencyId = filters.agencyId;
  if (filters.status) where.status = filters.status;

  const [batches, total] = await Promise.all([
    prisma.settlementBatch.findMany({
      where,
      include: { agency: true },
      take: filters.limit,
      skip: filters.offset,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.settlementBatch.count({ where }),
  ]);

  return {
    batches: batches.map((b) => ({
      id: b.id,
      agencyId: b.agencyId,
      agencyName: b.agency.name,
      nvlPaymentRef: b.nvlPaymentRef,
      status: b.status as SettlementStatus,
      weekStartDate: b.weekStartDate.toISOString(),
      weekEndDate: b.weekEndDate.toISOString(),
      totalRevenue: b.totalRevenue,
      netAmount: b.netAmount,
      createdAt: b.createdAt.toISOString(),
    })),
    total,
  };
}

export async function getBatchById(prisma: PrismaClient, id: string) {
  const batch = await prisma.settlementBatch.findUnique({
    where: { id },
    include: {
      agency: true,
      importFiles: { include: { importDocuments: true } },
    },
  });

  if (!batch) {
    throw new Error('Batch not found');
  }

  return batch;
}

export async function lockBatch(prisma: PrismaClient, id: string, userId: string) {
  const batch = await prisma.settlementBatch.findUnique({ where: { id } });

  if (!batch) {
    throw new Error('Batch not found');
  }

  if (batch.status !== SettlementStatus.IMPORT_APPROVED) {
    throw new Error('Batch must be in IMPORT_APPROVED status to be locked');
  }

  const updated = await prisma.settlementBatch.update({
    where: { id },
    data: {
      status: SettlementStatus.LOCKED,
      lockedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      batchId: id,
      action: 'BATCH_LOCKED',
      performedBy: userId,
      beforeSnapshot: JSON.stringify(batch),
      afterSnapshot: JSON.stringify(updated),
    },
  });

  return updated;
}

export async function clearFunds(prisma: PrismaClient, id: string, userId: string) {
  const batch = await prisma.settlementBatch.findUnique({ where: { id } });

  if (!batch) {
    throw new Error('Batch not found');
  }

  if (batch.status !== SettlementStatus.LOCKED) {
    throw new Error('Batch must be locked before funds can be cleared');
  }

  const updated = await prisma.settlementBatch.update({
    where: { id },
    data: {
      status: SettlementStatus.FUNDS_CLEARED,
      fundsClearedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      batchId: id,
      action: 'FUNDS_CLEARED',
      performedBy: userId,
      beforeSnapshot: JSON.stringify(batch),
      afterSnapshot: JSON.stringify(updated),
    },
  });

  return updated;
}
