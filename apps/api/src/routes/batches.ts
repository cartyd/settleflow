import { FastifyPluginAsync } from 'fastify';
import * as batchService from '../services/batch.service.js';
import * as batchDetailService from '../services/batch-detail.service.js';
import * as importService from '../services/import.service.js';
import * as importLineService from '../services/import-line.service.js';
import * as driverMatcherService from '../services/driver-matcher.service.js';
import * as autoBatchImportService from '../services/auto-batch-import.service.js';
import { loadConfig } from '@settleflow/shared-config';
import path from 'path';
import fs from 'fs';
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

  fastify.get('/:id/details', {
    schema: {
      description: 'Get comprehensive batch detail data',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { id } = BatchIdParamSchema.parse(request.params);
      try {
        const details = await batchDetailService.getBatchDetailData(fastify.prisma, id);
        return reply.send(details);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to get batch details',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  fastify.get('/:id/pdf', {
    schema: {
      description: 'Get PDF file for batch',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { id } = BatchIdParamSchema.parse(request.params);
      try {
        // Get the batch to find the import file
        const batch = await fastify.prisma.settlementBatch.findUnique({
          where: { id },
          include: {
            importFiles: {
              take: 1,
              orderBy: { uploadedAt: 'desc' },
            },
          },
        });

        if (!batch || !batch.importFiles[0]) {
          return reply.status(404).send({ error: 'Batch or PDF file not found' });
        }

        const config = loadConfig();
        const fileName = batch.importFiles[0].fileName;
        const filePath = path.join(config.storage.pdfPath, fileName);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
          return reply.status(404).send({ error: 'PDF file not found on disk' });
        }

        // Send the PDF file
        const stream = fs.createReadStream(filePath);
        reply.type('application/pdf');
        reply.header('Content-Disposition', `inline; filename="${fileName}"`);
        return reply.send(stream);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to serve PDF',
          message: error instanceof Error ? error.message : String(error),
        });
      }
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

  // New auto-upload endpoint - creates batch automatically from PDF
  fastify.post('/upload', {
    schema: {
      description: 'Upload PDF and auto-create batch from remittance data',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
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

      // Upload PDF and auto-create batch
      try {
        const result = await autoBatchImportService.uploadPdfAndCreateBatch(
          fastify.prisma,
          data.filename,
          buffer,
          {
            model: config.ocr.model,
            serverUrl: config.ocr.serverUrl,
          },
          'system' // TODO: Get actual user ID from auth
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

  // Legacy endpoint - kept for backwards compatibility
  fastify.post('/:id/upload', {
    schema: {
      description: 'Upload and process PDF settlement file (legacy)',
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

  fastify.post('/import-files/:importFileId/parse', {
    schema: {
      description: 'Parse import file documents and create ImportLine records',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { importFileId } = request.params as { importFileId: string };

      try {
        const result = await importLineService.parseImportFile(importFileId);
        reply.send(result);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to parse import file',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  fastify.get('/import-files/:importFileId/summary', {
    schema: {
      description: 'Get summary of parsed import lines',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { importFileId } = request.params as { importFileId: string };

      try {
        const summary = await importLineService.getImportLineSummary(importFileId);
        reply.send(summary);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to get import summary',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  fastify.post('/import-files/:importFileId/match-drivers', {
    schema: {
      description: 'Match driver names to Driver records',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { importFileId } = request.params as { importFileId: string };

      try {
        const result = await driverMatcherService.matchDriversForImportFile(importFileId);
        return reply.send(result);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to match drivers',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  fastify.post('/import-files/:importFileId/reset', {
    schema: {
      description: 'Reset parsed status to allow re-parsing',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { importFileId } = request.params as { importFileId: string };

      try {
        // Delete existing import lines
        await fastify.prisma.importLine.deleteMany({
          where: {
            importDocument: {
              importFileId,
            },
          },
        });

        // Reset parsedAt timestamps
        await fastify.prisma.importDocument.updateMany({
          where: { importFileId },
          data: { parsedAt: null },
        });

        return reply.send({
          success: true,
          message: 'Import file reset successfully',
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to reset import file',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  fastify.get('/import-files/:importFileId/lines', {
    schema: {
      description: 'Get all parsed import lines for an import file',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { importFileId } = request.params as { importFileId: string };

      try {
        const lines = await fastify.prisma.importLine.findMany({
          where: {
            importDocument: {
              importFileId,
            },
          },
          include: {
            importDocument: {
              select: {
                pageNumber: true,
                documentType: true,
              },
            },
          },
          orderBy: [
            { importDocument: { pageNumber: 'asc' } },
            { createdAt: 'asc' },
          ],
        });

        // Manually fetch driver info for lines that have driverId
        const linesWithDrivers = await Promise.all(
          lines.map(async (line) => {
            if (line.driverId) {
              const driver = await fastify.prisma.driver.findUnique({
                where: { id: line.driverId },
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              });
              return { ...line, driver };
            }
            return { ...line, driver: null };
          })
        );

        return reply.send({
          success: true,
          lines: linesWithDrivers.map(line => ({
            id: line.id,
            pageNumber: line.importDocument?.pageNumber,
            documentType: line.importDocument?.documentType,
            category: line.category,
            lineType: line.lineType,
            date: line.date,
            description: line.description,
            amount: line.amount,
            driver: line.driver ? {
              id: line.driver.id,
              name: `${line.driver.firstName} ${line.driver.lastName}`,
            } : null,
            reference: line.reference,
            accountNumber: line.accountNumber,
            tripNumber: line.tripNumber,
            billOfLading: line.billOfLading,
          })),
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to get import lines',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
};
