import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { loadConfig } from '@settleflow/shared-config';
import {
  CreateBatchSchema,
  GetBatchesQuerySchema,
  BatchIdParamSchema,
} from '@settleflow/shared-validation';
import { FastifyPluginAsync } from 'fastify';

import * as autoBatchImportService from '../services/auto-batch-import.service.js';
import * as batchDetailService from '../services/batch-detail.service.js';
import * as batchService from '../services/batch.service.js';
import * as driverMatcherService from '../services/driver-matcher.service.js';
import * as importLineService from '../services/import-line.service.js';
import * as importService from '../services/import.service.js';
import { captureCustomError } from '../utils/sentry.js';


// Helper function to extract and serve a specific PDF page
async function extractAndServePdfPage(
  pdfPath: string,
  pageNum: number,
  reply: any,
  fastify: any
): Promise<void> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join('/tmp', `page-${Date.now()}-${pageNum}.pdf`);
    
    // Use pdftk or qpdf to extract the page
    // Format: qpdf input.pdf --pages input.pdf pageNum -- output.pdf
    const args = [pdfPath, '--pages', pdfPath, String(pageNum), '--', outputPath];
    const process = spawn('qpdf', args);

    let stderr = '';
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        fastify.log.error({ stderr, code }, 'qpdf extraction failed');
        // Cleanup and reject
        fs.unlink(outputPath, () => {});
        reply.status(500).send({ error: 'Failed to extract PDF page' });
        return reject(new Error('qpdf failed'));
      }

      // Send the extracted page
      const stream = fs.createReadStream(outputPath);
      reply.type('application/pdf');
      reply.header('Content-Disposition', `inline; filename="page-${pageNum}.pdf"`);
      
      stream.on('end', () => {
        // Cleanup temp file after sending
        fs.unlink(outputPath, (err) => {
          if (err) fastify.log.warn({ err }, 'Failed to cleanup temp PDF');
        });
        resolve();
      });

      stream.on('error', (err) => {
        fastify.log.error({ err }, 'Error streaming extracted PDF');
        fs.unlink(outputPath, () => {});
        reject(err);
      });

      reply.send(stream);
    });

    process.on('error', (err) => {
      fastify.log.error({ err }, 'Failed to spawn qpdf process');
      reply.status(500).send({ error: 'PDF extraction not available' });
      reject(err);
    });
  });
}

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
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if this is a parsing failure error
        if (errorMessage.includes('failed to parse and cannot be viewed')) {
          return reply.status(422).send({
            error: 'Batch parsing failed',
            message: errorMessage,
            statusCode: 422,
          });
        }
        
        return reply.status(500).send({
          error: 'Failed to get batch details',
          message: errorMessage,
        });
      }
    },
  });

  fastify.get('/:id/pdf', {
    schema: {
      description: 'Get PDF file for batch, optionally a specific page',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { id } = BatchIdParamSchema.parse(request.params);
      const query = request.query as { page?: string };
      const pageNum = query.page ? parseInt(query.page) : null;
      
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

        if (!batch?.importFiles[0]) {
          return reply.status(404).send({ 
            error: 'Batch or PDF file not found'
          });
        }

        const config = loadConfig();
        const fileName = batch.importFiles[0].fileName;
        const filePath = path.join(config.storage.pdfPath, fileName);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
          return reply.status(404).send({ 
            error: 'PDF file not found on disk'
          });
        }

        // If specific page requested, extract it
        if (pageNum && pageNum > 0) {
          return extractAndServePdfPage(filePath, pageNum, reply, fastify);
        }

        // Send the full PDF file
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

  fastify.delete('/:id', {
    schema: {
      description: 'Delete a batch and all related data',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { id } = BatchIdParamSchema.parse(request.params);
      try {
        await batchService.deleteBatch(fastify.prisma, id, 'system');
        reply.send({
          success: true,
          message: 'Batch deleted successfully',
        });
      } catch (error) {
        fastify.log.error(error);
        captureCustomError(error as Error, {
          level: 'error',
          tags: {
            operation: 'delete_batch',
            batchId: id,
          },
          extra: {
            batchId: id,
          },
        });
        return reply.status(500).send({
          error: 'Failed to delete batch',
          message: error instanceof Error ? error.message : String(error),
        });
      }
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
        // Build OCR config based on provider
        const ocrConfig = config.ocr.provider === 'gemini'
          ? {
              apiKey: config.ocr.geminiApiKey!,
              model: config.ocr.geminiModel,
              timeoutMs: config.ocr.timeoutMs,
            }
          : {
              model: config.ocr.model,
              serverUrl: config.ocr.serverUrl,
              timeoutMs: config.ocr.timeoutMs,
            };
        
        const result = await autoBatchImportService.uploadPdfAndCreateBatch(
          fastify.prisma,
          data.filename,
          buffer,
          ocrConfig,
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
        // Build OCR config based on provider
        const ocrConfig = config.ocr.provider === 'gemini'
          ? {
              apiKey: config.ocr.geminiApiKey!,
              model: config.ocr.geminiModel,
              timeoutMs: config.ocr.timeoutMs,
            }
          : {
              model: config.ocr.model,
              serverUrl: config.ocr.serverUrl,
              timeoutMs: config.ocr.timeoutMs,
            };
        
        const result = await importService.processUploadedPdf(
          fastify.prisma,
          id,
          data.filename,
          buffer,
          ocrConfig
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
        const result = await importLineService.parseImportFile(fastify.prisma, importFileId);
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
        const summary = await importLineService.getImportLineSummary(fastify.prisma, importFileId);
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
        const result = await driverMatcherService.matchDriversForImportFile(fastify.prisma, importFileId);
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

  fastify.get('/import-files/:importFileId/documents', {
    schema: {
      description: 'Get all import documents with raw OCR text',
      tags: ['batches'],
    },
    handler: async (request, reply) => {
      const { importFileId } = request.params as { importFileId: string };

      try {
        const documents = await fastify.prisma.importDocument.findMany({
          where: { importFileId },
          orderBy: { pageNumber: 'asc' },
          select: {
            id: true,
            pageNumber: true,
            documentType: true,
            rawText: true,
            parsedAt: true,
          },
        });

        return reply.send({
          success: true,
          documents,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to get import documents',
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
