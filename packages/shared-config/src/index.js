"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
function getEnvVar(key, defaultValue) {
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
function getEnvVarAsNumber(key, defaultValue) {
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
function loadConfig() {
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
    };
}
//# sourceMappingURL=index.js.map