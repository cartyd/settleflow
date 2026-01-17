import { defineConfig } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path for SQLite
const dbPath = process.env.DATABASE_URL || `file:${path.join(__dirname, 'dev.db')}`;

// Create adapter for Prisma
const adapter = new PrismaLibSql({ url: dbPath });

export default defineConfig({
  adapter,
  datasource: {
    url: dbPath,
  },
});
