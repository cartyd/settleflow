import { errorPageConfig } from '../config/viewConfig';

export interface ErrorContext {
  statusCode?: number;
  errorMessage?: string;
  errorId?: string;
  timestamp?: Date;
  isDevelopment?: boolean;
}

export function getErrorConfig(
  statusCode?: number
): (typeof errorPageConfig.errorTypes)[keyof typeof errorPageConfig.errorTypes] {
  if (!statusCode || !errorPageConfig.errorTypes[statusCode as keyof typeof errorPageConfig.errorTypes]) {
    return errorPageConfig.defaultError;
  }
  return errorPageConfig.errorTypes[statusCode as keyof typeof errorPageConfig.errorTypes];
}

export function generateErrorId(): string {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

export function formatErrorContext(context: ErrorContext) {
  const errorId = context.errorId || generateErrorId();
  const timestamp = context.timestamp || new Date();
  const errorConfig = getErrorConfig(context.statusCode);

  return {
    statusCode: context.statusCode,
    errorId,
    timestamp,
    title: errorConfig.title,
    severity: errorConfig.severity,
    userMessage: context.errorMessage || errorConfig.userMessage,
    // Only show technical details in development
    technicalMessage: context.isDevelopment ? errorConfig.message : undefined,
  };
}
