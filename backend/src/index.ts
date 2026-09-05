import { buildServer } from './server.js';
import { env } from './config/env.js';

const server = buildServer();

async function start() {
  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`RenewalRadar backend listening on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
