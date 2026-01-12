import { FastifyPluginAsync } from 'fastify';
import * as batchService from '../services/batch.service.js';
import * as importService from '../services/import.service.js';
import { loadConfig } from '@settleflow/shared-config';
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

  fastify.post('/:id/upload', {
    schema: {
      description: 'Upload and process PDF settlement file',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { id } = BatchIdParamSchema.parse(request.params);
      const config = loadConfig();

      if (!config.ocr.enabled) {
        return reply.status(503).send({
          error: 'OCR service is not enabled',
        });
      }

      // Get uploaded file
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          error: 'No file uploaded',
        });
      }

      // Validate file type
      if (!data.mimetype.includes('pdf')) {
        return reply.status(400).send({
          error: 'Only PDF files are supported',
        });
      }

      // Read file buffer
      const buffer = await data.toBuffer();

      // Process PDF with OCR
      try {
        const result = await importService.processUploadedPdf(
          fastify.prisma,
          id,
          data.filename,
          buffer,
          {
            model: config.ocr.model,
            serverUrl: config.ocr.serverUrl,
          }
        );

        reply.status(201).send(result);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to process PDF',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
};
