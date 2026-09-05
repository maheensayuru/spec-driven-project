import { Queue, QueueOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

export const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 500,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 1000,
    },
  },
};

export const DEADLINE_SCANNER_QUEUE_NAME = 'deadline-scanner';
export const DOCUMENT_INGESTION_QUEUE_NAME = 'document-ingestion';

export const deadlineScannerQueue = new Queue(DEADLINE_SCANNER_QUEUE_NAME, defaultQueueOptions);
export const documentIngestionQueue = new Queue(DOCUMENT_INGESTION_QUEUE_NAME, defaultQueueOptions);
