import * as path from 'path';
import { fileURLToPath } from 'url';

import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import { AppConfig } from '@settleflow/shared-config';
import Fastify, { FastifyInstance } from 'fastify';
import nunjucks from 'nunjucks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        env.addFilter('date', (dateInput: string | Date, format: string) => {
          const months = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
          ];

          const pad2 = (n: number) => String(n).padStart(2, '0');

          // Treat pure YYYY-MM-DD strings as date-only to avoid TZ shifts
          if (typeof dateInput === 'string') {
            const dateOnlyMatch = dateInput.match(/^\d{4}-\d{2}-\d{2}$/);
            if (dateOnlyMatch) {
              const [y, m, d] = dateInput.split('-').map((s) => parseInt(s, 10));
              const monthIdx = m - 1; // 0-based

              if (format === 'MMM D') {
                return `${months[monthIdx]} ${d}`;
              }
              if (format === 'MMM D, YYYY') {
                return `${months[monthIdx]} ${d}, ${y}`;
              }
              if (format === 'MM/DD/YYYY') {
                return `${pad2(m)}/${pad2(d)}/${y}`;
              }
              // If a time-bearing format is requested but input has date-only,
              // fall back to a sensible date-only representation.
              if (format === 'MMM D, YYYY h:mm A') {
                return `${months[monthIdx]} ${d}, ${y} 12:00 AM`;
              }
              return dateInput;
            }
          }

          // Fallback to native Date for timestamps and full ISO strings
          const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
          if (isNaN(date.getTime())) return String(dateInput ?? '');

          const hours = date.getHours();
          const minutes = pad2(date.getMinutes());
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const hours12 = hours % 12 === 0 ? 12 : hours % 12;

          if (format === 'MMM D') {
            return `${months[date.getMonth()]} ${date.getDate()}`;
          }
          if (format === 'MMM D, YYYY') {
            return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
          }
          if (format === 'MMM D, YYYY h:mm A') {
            return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hours12}:${minutes} ${ampm}`;
          }
          if (format === 'MM/DD/YYYY') {
            return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
          }
          return String(dateInput ?? '');
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

  app.get('/', async (_request, reply) => {
    return reply.redirect('/admin/batches');
  });

  await app.register(batchRoutes, { prefix: '/admin/batches' });

  return app;
}
