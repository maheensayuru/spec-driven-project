import { buildServer } from './server.js';
import { env } from './config/env.js';
import {
  createDocumentExtractorWorker,
  closeDocumentExtractorWorker,
} from './queue/workers/document-extractor.worker.js';

const server = buildServer();

async function start() {
  try {
    // Initialize background queue worker; failure to reach Redis must not block HTTP server startup
    try {
      createDocumentExtractorWorker();
      server.log.info('Document extraction queue worker initialized');
    } catch (workerErr) {
      server.log.warn(
        `Document extraction worker could not connect to Redis: ${(workerErr as Error).message}. Continuing HTTP server startup.`,
      );
    }

    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`RenewalRadar backend listening on http://${env.HOST}:${env.PORT}`);

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      server.log.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await closeDocumentExtractorWorker();
      } catch (err) {
        server.log.warn(`Error closing extraction worker: ${(err as Error).message}`);
      }
      await server.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
