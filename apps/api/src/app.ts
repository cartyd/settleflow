import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { AppConfig } from '@settleflow/shared-config';
import { prismaPlugin } from './plugins/prisma';
import { sentryPlugin } from './plugins/sentry';
import { errorHandler } from './plugins/error-handler';
import { batchRoutes } from './routes/batches';
import { adjustmentRoutes } from './routes/adjustments';
import { healthRoute } from './routes/health';

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logging.level,
      transport: config.isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  });

  // Security plugins
  await app.register(helmet);
  await app.register(cors, {
    origin: config.cors.origin,
  });
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
  });

  // Multipart for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
    },
  });

  // Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'SettleFlow API',
        description: 'Trip Settlement Application API',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${config.api.port}`,
          description: 'Development server',
        },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Custom plugins
  await app.register(prismaPlugin);
  if (config.sentry.enabled) {
    await app.register(sentryPlugin, { dsn: config.sentry.dsn });
  }
  await app.register(errorHandler);

  // Routes
  await app.register(healthRoute);
  await app.register(batchRoutes, { prefix: '/batches' });
  await app.register(adjustmentRoutes, { prefix: '/adjustments' });

  return app;
}
