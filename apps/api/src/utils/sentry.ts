import * as Sentry from '@sentry/node';

/**
 * Sentry utilities for manual logging and error tracking in services
 *
 * Usage:
 * - Import these utilities in your services for custom error tracking
 * - Use captureCustomError for business logic errors
 * - Use logPerformance for tracking slow operations
 * - Use logMetric for custom metrics
 */

/**
 * Capture a custom error with additional context
 */
export function captureCustomError(
  error: Error,
  context?: {
    level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    user?: { id: string; email?: string; username?: string };
  }
) {
  Sentry.captureException(error, {
    level: context?.level || 'error',
    tags: context?.tags,
    extra: context?.extra,
    user: context?.user,
  });
}

/**
 * Capture a custom message (non-error event)
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }
) {
  Sentry.captureMessage(message, {
    level,
    tags: context?.tags,
    extra: context?.extra,
  });
}

/**
 * High-value event logger for structured logging to Sentry Logs
 *
 * Focus on capturing important business events, not debug logs.
 * Use this for significant operations like:
 * - File imports and processing
 * - Data parsing and validation
 * - Driver matching and resolution
 * - Settlement calculations
 * - Payment processing
 * - Errors and warnings
 */
export const logger = {
  /**
   * Log important business events (e.g., batch imported, file processed)
   */
  info: (message: string, extra?: Record<string, any>) => {
    Sentry.logger.info(message, extra);
  },

  /**
   * Log warning-level events (e.g., data quality issues, partial failures)
   */
  warn: (message: string, extra?: Record<string, any>) => {
    Sentry.logger.warn(message, extra);
  },

  /**
   * Log errors (e.g., parsing failed, validation error)
   */
  error: (message: string, extra?: Record<string, any>) => {
    Sentry.logger.error(message, extra);
  },

  /**
   * Log critical failures that may require immediate attention
   */
  fatal: (message: string, extra?: Record<string, any>) => {
    Sentry.logger.fatal(message, extra);
  },
};

/**
 * Track a custom performance metric
 *
 * Example:
 * const metric = startPerformanceTracking('ocr.process_pdf');
 * // ... do work
 * metric.finish({ success: true, pages: 10 });
 */
export function startPerformanceTracking(operation: string, data?: Record<string, any>) {
  let span: any = null;

  // Use startSpanManual to get a handle to the span
  const result = Sentry.startSpanManual(
    {
      op: operation,
      name: operation,
      attributes: data,
    },
    (s) => {
      span = s;
      return s;
    }
  );

  return {
    finish: (additionalData?: Record<string, any>) => {
      if (additionalData && span) {
        span.setAttributes(additionalData);
      }
      result.end();
    },
    setStatus: (
      statusCode:
        | 'ok'
        | 'cancelled'
        | 'unknown_error'
        | 'invalid_argument'
        | 'deadline_exceeded'
        | 'not_found'
        | 'already_exists'
        | 'permission_denied'
        | 'resource_exhausted'
        | 'failed_precondition'
        | 'aborted'
        | 'out_of_range'
        | 'unimplemented'
        | 'internal_error'
        | 'unavailable'
        | 'data_loss'
        | 'unauthenticated'
    ) => {
      if (span) {
        span.setStatus({ code: statusCode });
      }
    },
  };
}

/**
 * Log a breadcrumb for debugging
 * Breadcrumbs help reconstruct the sequence of events leading to an error
 */
export function addBreadcrumb(
  message: string,
  category: string = 'custom',
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  data?: Record<string, any>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Set user context for subsequent events
 * Call this when user is authenticated
 */
export function setUser(user: {
  id: string;
  email?: string;
  username?: string;
  [key: string]: any;
}) {
  Sentry.setUser(user);
}

/**
 * Clear user context (e.g., on logout)
 */
export function clearUser() {
  Sentry.setUser(null);
}

/**
 * Add tags to subsequent events
 * Tags are searchable/filterable in Sentry
 */
export function setTags(tags: Record<string, string>) {
  Object.entries(tags).forEach(([key, value]) => {
    Sentry.setTag(key, value);
  });
}

/**
 * Add extra context to subsequent events
 * Extra data is not searchable but provides additional debugging info
 */
export function setExtra(key: string, value: any) {
  Sentry.setExtra(key, value);
}

/**
 * Wrap an async function with performance tracking
 *
 * Example:
 * const result = await trackAsyncOperation(
 *   'parser.parse_document',
 *   async () => parseDocument(doc),
 *   { documentType: 'REVENUE_DISTRIBUTION' }
 * );
 */
export async function trackAsyncOperation<T>(
  operationName: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  const metric = startPerformanceTracking(operationName, tags);

  try {
    const result = await fn();
    metric.setStatus('ok');
    metric.finish();
    return result;
  } catch (error) {
    metric.setStatus('internal_error');
    metric.finish();
    captureCustomError(error as Error, {
      tags: { ...tags, operation: operationName },
    });
    throw error;
  }
}

/**
 * Log a custom metric value
 * Useful for tracking counts, durations, sizes, etc.
 */
export function logMetric(
  name: string,
  value: number,
  unit?: string,
  tags?: Record<string, string>
) {
  addBreadcrumb(`Metric: ${name} = ${value}${unit ? ` ${unit}` : ''}`, 'metric', 'info', {
    metric: name,
    value,
    unit,
    ...tags,
  });
}

/**
 * Example usage in a service:
 *
 * import { trackAsyncOperation, addBreadcrumb, captureCustomError, logger } from '../utils/sentry';
 *
 * async function processDocument(doc: Document) {
 *   logger.info('Starting document processing', { docId: doc.id, docType: doc.type });
 *
 *   return trackAsyncOperation(
 *     'document.process',
 *     async () => {
 *       addBreadcrumb('Starting document processing', 'document', 'info', { docId: doc.id });
 *
 *       const result = await heavyOperation(doc);
 *
 *       if (!result.valid) {
 *         logger.warn('Invalid processing result', { result, docId: doc.id });
 *         captureCustomError(new Error('Invalid result'), {
 *           level: 'warning',
 *           tags: { docType: doc.type },
 *           extra: { result }
 *         });
 *       } else {
 *         logger.info('Document processed successfully', { docId: doc.id, linesProcessed: result.lines.length });
 *       }
 *
 *       return result;
 *     },
 *     { documentType: doc.type }
 *   );
 * }
 */
