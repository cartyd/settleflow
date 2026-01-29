import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';

// Find the monorepo root by looking for package.json with workspaces
function findMonorepoRoot(): string {
  let currentDir = process.cwd();
  
  while (currentDir !== path.parse(currentDir).root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        // Check if this is the monorepo root (has workspaces)
        if (packageJson.workspaces) {
          return currentDir;
        }
      } catch (e) {
        // Continue searching if package.json is invalid
      }
    }
    
    currentDir = path.dirname(currentDir);
  }
  
  // Fallback to process.cwd() if no monorepo root found
  return process.cwd();
}

const MONOREPO_ROOT = findMonorepoRoot();

dotenv.config({ path: path.resolve(MONOREPO_ROOT, '.env') });

// Resolve DATABASE_URL if it's a relative file: URL
if (process.env.DATABASE_URL?.startsWith('file:')) {
  const dbPath = process.env.DATABASE_URL.substring(5); // Remove 'file:' prefix
  if (!path.isAbsolute(dbPath)) {
    const resolvedDbPath = path.resolve(MONOREPO_ROOT, dbPath);
    process.env.DATABASE_URL = `file:${resolvedDbPath}`;
  }
}

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
    environment?: string;
    tracesSampleRate?: number;
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
    provider: 'ollama' | 'gemini';
    // Ollama config
    serverUrl: string;
    model: string;
    timeoutMs: number;
    // Gemini config
    geminiApiKey?: string;
    geminiModel?: string;
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

  // Resolve PDF storage path relative to monorepo root
  const pdfStoragePath = getEnvVar('PDF_STORAGE_PATH', './uploads/pdfs');
  const resolvedPdfPath = path.isAbsolute(pdfStoragePath)
    ? pdfStoragePath
    : path.resolve(MONOREPO_ROOT, pdfStoragePath);

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
      ...(process.env.SENTRY_DSN ? { dsn: process.env.SENTRY_DSN } : {}),
      enabled: !!process.env.SENTRY_DSN,
      environment: nodeEnv,
      tracesSampleRate: getEnvVarAsNumber('SENTRY_TRACES_SAMPLE_RATE', isDevelopment ? 1.0 : 0.1),
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
      provider: (getEnvVar('OCR_PROVIDER', 'ollama') as 'ollama' | 'gemini'),
      // Ollama config
      serverUrl: getEnvVar('OCR_SERVER_URL', 'http://10.147.17.205:11434/api/generate'),
      model: getEnvVar('OCR_MODEL', 'gemma3:27b'),
      timeoutMs: getEnvVarAsNumber('OCR_TIMEOUT_MS', 120000), // Default 120 seconds
      // Gemini config
      ...(process.env.GEMINI_API_KEY ? { geminiApiKey: process.env.GEMINI_API_KEY } : {}),
      geminiModel: getEnvVar('GEMINI_MODEL', 'gemini-2.0-flash-exp'),
    },
    storage: {
      pdfPath: resolvedPdfPath,
    },
  };
}
