import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import * as Sentry from '@sentry/node';

interface SentryOptions {
  dsn?: string;
}

const sentryPlugin: FastifyPluginAsync<SentryOptions> = async (fastify, opts) => {
  if (!opts.dsn) {
    fastify.log.warn('Sentry DSN not provided, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn: opts.dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0,
  });

  fastify.addHook('onRequest', async (request) => {
    Sentry.setContext('request', {
      id: request.id,
      method: request.method,
      url: request.url,
    });
  });

  fastify.addHook('onError', async (request, reply, error) => {
    Sentry.captureException(error, {
      contexts: {
        request: {
          id: request.id,
          method: request.method,
          url: request.url,
        },
      },
    });
  });

  fastify.log.info('Sentry plugin initialized');
};

export default fp(sentryPlugin);
export { sentryPlugin };
