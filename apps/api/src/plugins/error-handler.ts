import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';

const errorHandler: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: 'Validation Error',
        message: 'Request validation failed',
        statusCode: 400,
        details: error.errors,
      });
      return;
    }

    if (error.statusCode && error.statusCode < 500) {
      reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
        statusCode: error.statusCode,
      });
      return;
    }

    fastify.log.error(error);

    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode: 500,
    });
  });
};

export default fp(errorHandler);
export { errorHandler };
