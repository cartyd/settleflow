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

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const batch = await apiClient.getBatchById(id);
      const pageTitle = batchDetailConfig.pageTitle(
        batch.nvlPaymentRef || 'Unknown'
      );
      
      return reply.view('batches/detail.njk', {
        batch,
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
};
