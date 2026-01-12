import { loadConfig } from '@settleflow/shared-config';
import { buildApp } from './app';

async function start() {
  const config = loadConfig();

  const app = await buildApp(config);

  try {
    await app.listen({
      port: config.admin.port,
      host: config.admin.host,
    });

    app.log.info(`Admin UI listening on ${config.admin.host}:${config.admin.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
