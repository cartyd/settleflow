import { loadConfig } from '@settleflow/shared-config';
import { buildApp } from './app';

async function start() {
  const config = loadConfig();

  const app = await buildApp(config);

  try {
    await app.listen({
      port: config.api.port,
      host: config.api.host,
    });

    app.log.info(`API server listening on ${config.api.host}:${config.api.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
