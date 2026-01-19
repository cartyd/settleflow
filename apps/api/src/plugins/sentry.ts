import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import * as Sentry from '@sentry/node';

interface SentryOptions {
  dsn?: string;
  environment?: string;
  tracesSampleRate?: number;
}

/**
 * Enhanced Sentry plugin for comprehensive error monitoring, logging, and performance tracking
 * 
 * Features:
 * - Automatic error capturing with context
 * - Performance monitoring (APM)
 * - Request tracing and timing
 * - User context and tags
 * - Breadcrumb tracking
 */
const sentryPlugin: FastifyPluginAsync<SentryOptions> = async (fastify, opts) => {
  if (!opts.dsn) {
    fastify.log.warn('Sentry DSN not provided, skipping Sentry initialization');
    return;
  }

  const environment = opts.environment || process.env.NODE_ENV || 'development';
  const isDevelopment = environment === 'development';
  
  // Initialize Sentry with comprehensive configuration
  Sentry.init({
    dsn: opts.dsn,
    environment,
    
    // Performance Monitoring
    tracesSampleRate: opts.tracesSampleRate ?? (isDevelopment ? 1.0 : 0.1),
    
    // Release tracking
    release: process.env.npm_package_version || '1.0.0',
    
    // Debug mode in development
    debug: isDevelopment,
    
    // Enable Sentry Logs product
    enableLogs: true,
    integrations: [
      // Capture console.log, console.warn, and console.error as logs
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],
    
    // Filter sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-api-key'];
      }
      
      // Remove sensitive query parameters
      if (event.request?.query_string && typeof event.request.query_string === 'string') {
        const sanitized = event.request.query_string
          .replace(/token=[^&]*/gi, 'token=REDACTED')
          .replace(/password=[^&]*/gi, 'password=REDACTED')
          .replace(/secret=[^&]*/gi, 'secret=REDACTED');
        event.request.query_string = sanitized;
      }
      
      return event;
    },
    
    // Ignore health check and metrics endpoints
    ignoreErrors: [
      // Common errors to ignore
      'ECONNRESET',
      'EPIPE',
      'ECONNABORTED',
    ],
    
    beforeBreadcrumb(breadcrumb) {
      // Don't log health check breadcrumbs
      if (breadcrumb.category === 'http' && breadcrumb.data?.url?.includes('/health')) {
        return null;
      }
      return breadcrumb;
    },
  });

  // Add Sentry to fastify instance for manual error reporting
  fastify.decorate('sentry', Sentry);

  // Request tracing hook - start span for each request
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // Skip tracing for health checks
    if (request.url === '/health' || request.url === '/metrics') {
      return;
    }

    // Start span for performance monitoring
    const span = Sentry.startSpan(
      {
        op: 'http.server',
        name: `${request.method} ${request.routeOptions?.url || request.url}`,
        attributes: {
          method: request.method,
          url: request.url,
          'http.request.id': request.id,
        },
      },
      () => {
        // This callback runs in isolation scope
        const scope = Sentry.getCurrentScope();
        
        // Set request context
        scope.setContext('request', {
          id: request.id,
          method: request.method,
          url: request.url,
          route: request.routeOptions?.url,
          query: request.query,
          headers: {
            'user-agent': request.headers['user-agent'],
            'content-type': request.headers['content-type'],
          },
        });

        // Set user context if available (e.g., from auth)
        if (request.headers['x-user-id']) {
          scope.setUser({
            id: request.headers['x-user-id'] as string,
          });
        }

        // Add tags for filtering
        scope.setTag('route', request.routeOptions?.url || request.url);
        scope.setTag('method', request.method);
      }
    );

    // Store span on request for access in other hooks
    (request as any).sentrySpan = span;

    // Add breadcrumb
    Sentry.addBreadcrumb({
      category: 'http',
      message: `${request.method} ${request.url}`,
      level: 'info',
      data: {
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
    });
  });

  // Response timing and metrics
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const span = (request as any).sentrySpan;
    
    if (span) {
      // Add response data to span
      span.setAttributes({
        'http.response.status_code': reply.statusCode,
        'http.response_time_ms': Math.round(reply.getResponseTime() * 1000),
      });
      
      // Set span status based on response
      if (reply.statusCode >= 500) {
        span.setStatus({ code: 'internal_error' });
      } else if (reply.statusCode >= 400) {
        span.setStatus({ code: 'invalid_argument' });
      } else {
        span.setStatus({ code: 'ok' });
      }
      
      // End span
      span.end();
    }

    // Track custom metrics
    if (reply.statusCode >= 400) {
      Sentry.addBreadcrumb({
        category: 'http.error',
        message: `HTTP ${reply.statusCode} on ${request.method} ${request.url}`,
        level: reply.statusCode >= 500 ? 'error' : 'warning',
        data: {
          statusCode: reply.statusCode,
          requestId: request.id,
        },
      });
    }
  });

  // Error capturing hook
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    // Skip logging for health checks
    if (request.url === '/health' || request.url === '/metrics') {
      return;
    }

    const span = (request as any).sentrySpan;
    
    // Capture exception with full context
    Sentry.captureException(error, {
      contexts: {
        request: {
          id: request.id,
          method: request.method,
          url: request.url,
          route: request.routeOptions?.url,
          query: request.query,
          params: request.params,
          headers: {
            'user-agent': request.headers['user-agent'],
            'content-type': request.headers['content-type'],
          },
        },
        response: {
          statusCode: reply.statusCode,
        },
      },
      tags: {
        route: request.routeOptions?.url || request.url,
        method: request.method,
        errorType: error.name,
      },
      level: 'error',
    });

    // Mark span as failed if exists
    if (span) {
      span.setStatus({ code: 'internal_error' });
      span.end();
    }
  });

  // Graceful shutdown - flush Sentry events
  fastify.addHook('onClose', async () => {
    fastify.log.info('Flushing Sentry events before shutdown...');
    await Sentry.close(2000); // Wait up to 2 seconds for events to be sent
  }); 

  fastify.log.info({
    environment,
    tracesSampleRate: opts.tracesSampleRate ?? (isDevelopment ? 1.0 : 0.1),
  }, 'Sentry plugin initialized');
};

export default fp(sentryPlugin);
export { sentryPlugin };

// Extend Fastify types to include Sentry
declare module 'fastify' {
  interface FastifyInstance {
    sentry: typeof Sentry;
  }
}
