import * as path from 'path';

import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import { AppConfig } from '@settleflow/shared-config';
import Fastify, { FastifyInstance } from 'fastify';
import * as nunjucks from 'nunjucks';



import { batchRoutes } from './routes/batches';

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

  const viewsPath = path.join(__dirname, '../views');

  await app.register(fastifyView, {
    engine: {
      nunjucks,
    },
    root: viewsPath,
    options: {
      autoescape: true,
      throwOnUndefined: false,
      trimBlocks: true,
      lstripBlocks: true,
      onConfigure: (env: nunjucks.Environment) => {
        // Add date filter
        env.addFilter('date', (dateString: string, format: string) => {
          const date = new Date(dateString);
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          
          if (format === 'MMM D') {
            return `${months[date.getMonth()]} ${date.getDate()}`;
          } else if (format === 'MMM D, YYYY') {
            return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
          }
          return dateString;
        });

        // Add number filter
        env.addFilter('number', (value: number, decimals: number = 2) => {
          return value.toFixed(decimals);
        });

        // Add keys filter
        env.addFilter('keys', (obj: any) => {
          if (obj && typeof obj === 'object') {
            return Object.keys(obj);
          }
          return [];
        });

        // Add json_parse filter
        env.addFilter('json_parse', (str: string) => {
          try {
            return typeof str === 'string' ? JSON.parse(str) : str;
          } catch (e) {
            return {};
          }
        });
      },
    },
  });

  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/public/',
  });

  app.get('/', async (request, reply) => {
    return reply.redirect('/admin/batches');
  });

  await app.register(batchRoutes, { prefix: '/admin/batches' });

  return app;
}
