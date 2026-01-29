import { FastifyPluginAsync } from 'fastify';

export const adjustmentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', {
    schema: { description: 'Create adjustment', tags: ['adjustments'] },
    handler: async (_request, reply) => {
      reply.status(501).send({ error: 'Not implemented' });
    },
  });

  fastify.post('/:id/approve', {
    schema: { description: 'Approve adjustment', tags: ['adjustments'] },
    handler: async (_request, reply) => {
      reply.status(501).send({ error: 'Not implemented' });
    },
  });
};
