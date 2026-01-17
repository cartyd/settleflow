import { FastifyPluginAsync } from 'fastify';
import * as apiClient from '../services/api-client';
import { batchesViewConfig, batchDetailConfig } from '../config/viewConfig';
import { batchStatusConfig } from '../config/statusConfig';

// Map status values to CSS classes
const statusClasses = Object.entries(batchStatusConfig).reduce(
  (acc, [status, config]) => {
    acc[status] = config.cssClass;
    return acc;
  },
  {} as Record<string, string>
);

export const batchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    try {
      const batchesData = await apiClient.getBatches();
      const batchesWithUrls = (batchesData.batches || []).map(batch => ({
        ...batch,
        detailUrl: batchesViewConfig.detailViewPath(batch.id),
      }));
      
      return reply.view('batches/index.njk', {
        batches: batchesWithUrls,
        config: batchesViewConfig,
        statusClasses,
        currentYear: new Date().getFullYear(),
      });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // PDF endpoint must come before /:id to avoid being caught by the generic route
  fastify.get('/:id/pdf', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string };
    
    try {
      // Build URL with query parameters
      const url = new URL(`http://localhost:3000/batches/${id}/pdf`);
      if (query.page) {
        url.searchParams.set('page', query.page);
      }
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        const error = await response.json();
        return reply.status(response.status).send(error);
      }

      // Forward the PDF stream
      const contentType = response.headers.get('content-type');
      const contentDisposition = response.headers.get('content-disposition');
      
      if (contentType) {
        reply.type(contentType);
      }
      if (contentDisposition) {
        reply.header('Content-Disposition', contentDisposition);
      }

      const buffer = await response.arrayBuffer();
      return reply.send(Buffer.from(buffer));
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get PDF',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const batchDetails = await apiClient.getBatchDetails(id);
      const pageTitle = batchDetailConfig.pageTitle(
        batchDetails.nvlPaymentRef || 'Unknown'
      );
      
      return reply.view('batches/detail.njk', {
        batch: batchDetails,
        config: batchDetailConfig,
        statusClasses,
        pageTitle,
        currentYear: new Date().getFullYear(),
      });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  fastify.post('/import-files/:importFileId/parse', async (request, reply) => {
    const { importFileId } = request.params as { importFileId: string };
    try {
      const result = await apiClient.parseImportFile(importFileId);
      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to parse import file',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.get('/import-files/:importFileId/summary', async (request, reply) => {
    const { importFileId } = request.params as { importFileId: string };
    try {
      const summary = await apiClient.getImportFileSummary(importFileId);
      return reply.send(summary);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get import summary',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.post('/import-files/:importFileId/reset', async (request, reply) => {
    const { importFileId } = request.params as { importFileId: string };
    try {
      const response = await fetch(`http://localhost:3000/batches/import-files/${importFileId}/reset`, {
        method: 'POST',
      });
      const result = await response.json();
      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to reset import file',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.get('/import-files/:importFileId/lines', async (request, reply) => {
    const { importFileId } = request.params as { importFileId: string };
    try {
      const response = await fetch(`http://localhost:3000/batches/import-files/${importFileId}/lines`);
      const result = await response.json();
      return reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get parsed lines',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
