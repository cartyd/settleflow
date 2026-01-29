import path from 'path';
import { fileURLToPath } from 'url';

import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  // Database path for SQLite
  const dbPath =
    process.env.DATABASE_URL || `file:${path.join(__dirname, '..', '..', 'prisma', 'dev.db')}`;

  // Create adapter for Prisma using PrismaLibSql
  const adapter = new PrismaLibSql({ url: dbPath });

  const prisma = new PrismaClient({
    adapter,
    log: fastify.log.level === 'debug' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });

  await prisma.$connect();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });
};

export default fp(prismaPlugin);
export { prismaPlugin };
