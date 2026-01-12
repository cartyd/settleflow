import { FastifyPluginAsync } from 'fastify';
import * as batchService from '../services/batch.service';
import {
  CreateBatchSchema,
  GetBatchesQuerySchema,
  BatchIdParamSchema,
} from '@settleflow/shared-validation';

export const batchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', {
    schema: {
      description: 'Create a new settlement batch',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const data = CreateBatchSchema.parse(request.body);
      const batch = await batchService.createBatch(fastify.prisma, data, 'system');
      reply.status(201).send({
        id: batch.id,
        status: batch.status,
        createdAt: batch.createdAt.toISOString(),
      });
    },
  });

  fastify.get('/', {
    schema: {
      description: 'Get all batches',
      tags: ['batches'],
    },
    handler: async (request) => {
      const query = GetBatchesQuerySchema.parse(request.query);
      return await batchService.getBatches(fastify.prisma, query);
    },
  });

  fastify.get('/:id', {
    schema: {
      description: 'Get batch by ID',
      tags: ['batches'],
    },
    handler: async (request) => {
      const { id } = BatchIdParamSchema.parse(request.params);
      return await batchService.getBatchById(fastify.prisma, id);
    },
  });

  fastify.post('/:id/lock', {
    schema: {
      description: 'Lock a batch',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { id } = BatchIdParamSchema.parse(request.params);
      const batch = await batchService.lockBatch(fastify.prisma, id, 'system');
      reply.send({
        success: true,
        lockedAt: batch.lockedAt?.toISOString(),
      });
    },
  });

  fastify.post('/:id/funds-clear', {
    schema: {
      description: 'Mark funds as cleared',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { id } = BatchIdParamSchema.parse(request.params);
      const batch = await batchService.clearFunds(fastify.prisma, id, 'system');
      reply.send({
        success: true,
        clearedAt: batch.fundsClearedAt?.toISOString(),
      });
    },
  });
};
