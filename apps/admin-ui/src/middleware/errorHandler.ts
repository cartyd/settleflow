import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import { errorPageConfig } from '../config/viewConfig';
import { formatErrorContext, generateErrorId } from '../utils/errorHandler';

export interface ErrorResponse {
  statusCode: number;
  pageTitle: string;
  title: string;
  severity: string;
  userMessage: string;
  errorId: string;
  timestamp: Date;
  showSupportLink: boolean;
  config: typeof errorPageConfig;
}

export async function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const statusCode = (error as FastifyError).statusCode || 500;
  const errorId = generateErrorId();
  const timestamp = new Date();

  request.log.error({
    errorId,
    statusCode,
    message: error.message,
    stack: isDevelopment ? error.stack : undefined,
    url: request.url,
    method: request.method,
  });

  const errorContext = formatErrorContext({
    statusCode,
    errorMessage: undefined,
    errorId,
    timestamp,
    isDevelopment,
  });

  const errorResponse: ErrorResponse = {
    statusCode,
    pageTitle: errorPageConfig.pageTitle(statusCode),
    title: errorContext.title,
    severity: errorContext.severity,
    userMessage: errorContext.userMessage,
    errorId: errorContext.errorId,
    timestamp: errorContext.timestamp,
    showSupportLink: statusCode >= 500,
    config: errorPageConfig,
  };

  return reply.status(statusCode).view('error.njk', errorResponse);
}

export function createErrorRoute(fastify: any) {
  fastify.setErrorHandler(errorHandler);

  fastify.setNotFoundHandler(async (request, reply) => {
    const errorId = generateErrorId();
    const timestamp = new Date();

    const errorResponse: ErrorResponse = {
      statusCode: 404,
      pageTitle: errorPageConfig.pageTitle(404),
      title: 'Page Not Found',
      severity: 'info',
      userMessage: errorPageConfig.errorTypes[404].userMessage,
      errorId,
      timestamp,
      showSupportLink: false,
      config: errorPageConfig,
    };

    return reply.status(404).view('error.njk', errorResponse);
  });
}
