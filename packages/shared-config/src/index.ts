import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  isDevelopment: boolean;
  api: {
    port: number;
    host: string;
  };
  admin: {
    port: number;
    host: string;
  };
  database: {
    url: string;
    provider: 'sqlite' | 'postgres';
  };
  sentry: {
    dsn?: string;
    enabled: boolean;
  };
  logging: {
    level: string;
  };
  rateLimit: {
    max: number;
    window: number;
  };
  cors: {
    origin: string;
  };
  ocr: {
    enabled: boolean;
    serverUrl: string;
    model: string;
  };
  storage: {
    pdfPath: string;
  };
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    console.warn(`Warning: Missing environment variable: ${key}`);
    return '';
  }
  return value || defaultValue || '';
}

function getEnvVarAsNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  const nodeEnv = getEnvVar('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development';

  const databaseProvider = getEnvVar('DATABASE_PROVIDER', 'sqlite');
  if (databaseProvider !== 'sqlite' && databaseProvider !== 'postgres') {
    throw new Error('DATABASE_PROVIDER must be either "sqlite" or "postgres"');
  }

  return {
    nodeEnv,
    isProduction,
    isDevelopment,
    api: {
      port: getEnvVarAsNumber('PORT_API', 3000),
      host: getEnvVar('HOST_API', '0.0.0.0'),
    },
    admin: {
      port: getEnvVarAsNumber('PORT_ADMIN', 3001),
      host: getEnvVar('HOST_ADMIN', '0.0.0.0'),
    },
    database: {
      url: getEnvVar('DATABASE_URL', 'file:./dev.db'),
      provider: databaseProvider,
    },
    sentry: {
      dsn: process.env.SENTRY_DSN,
      enabled: !!process.env.SENTRY_DSN,
    },
    logging: {
      level: getEnvVar('LOG_LEVEL', 'info'),
    },
    rateLimit: {
      max: getEnvVarAsNumber('RATE_LIMIT_MAX', 100),
      window: getEnvVarAsNumber('RATE_LIMIT_WINDOW', 60000),
    },
    cors: {
      origin: getEnvVar('CORS_ORIGIN', 'http://localhost:3001'),
    },
    ocr: {
      enabled: getEnvVar('OCR_ENABLED', 'true') === 'true',
      serverUrl: getEnvVar('OCR_SERVER_URL', 'http://10.147.17.205:11434/api/generate'),
      model: getEnvVar('OCR_MODEL', 'gemma3:27b'),
    },
    storage: {
      pdfPath: getEnvVar('PDF_STORAGE_PATH', './uploads/pdfs'),
    },
  };
}
