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
}
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=index.d.ts.map