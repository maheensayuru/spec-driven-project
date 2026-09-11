import { Worker, Job } from 'bullmq';
import {
  redisConnection,
  deadlineScannerQueue,
  DEADLINE_SCANNER_QUEUE_NAME,
} from '../queue.config.js';
import { DeadlineScannerService } from '../../modules/monitoring/scanner.service.js';

export interface DeadlineScanJobData {
  organizationId?: string;
  referenceDate?: string;
  isManualTrigger?: boolean;
}

/**
 * BullMQ Worker processing autonomous deadline scanning jobs (Task T035 & FR-010).
 */
export function createDeadlineScannerWorker(): Worker<DeadlineScanJobData> {
  const worker = new Worker<DeadlineScanJobData>(
    DEADLINE_SCANNER_QUEUE_NAME,
    async (job: Job<DeadlineScanJobData>) => {
      const { organizationId, referenceDate, isManualTrigger } = job.data;

      const result = await DeadlineScannerService.runScan(organizationId, referenceDate);

      return {
        success: true,
        scanned: result.scanned,
        alertsCreated: result.alertsCreated,
        manual: !!isManualTrigger,
      };
    },
    {
      connection: redisConnection,
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    // Structured error logging without sensitive secrets
    console.error(`Deadline scanner job ${job?.id} failed:`, err.message);
  });

  return worker;
}

/**
 * Registers the daily repeatable cron job (every day at 02:00 UTC).
 */
export async function scheduleDailyDeadlineScanner(): Promise<void> {
  try {
    await deadlineScannerQueue.add(
      'daily-deadline-scan',
      {},
      {
        repeat: {
          pattern: '0 2 * * *', // 02:00 AM UTC every day
        },
        jobId: 'scheduled:daily-deadline-scan',
      },
    );
  } catch (err) {
    // Redis might be offline in development mode
    console.warn('Could not register BullMQ repeatable cron job:', (err as Error).message);
  }
}

/**
 * Manual development / demo execution runner allowing immediate on-demand scan execution (Task T035).
 */
export async function runManualScanDemo(
  organizationId?: string,
  referenceDate?: string,
): Promise<{ scanned: number; alertsCreated: number }> {
  return DeadlineScannerService.runScan(organizationId, referenceDate);
}

// Standalone execution if launched directly via tsx (e.g. for demo script)
if (process.argv[1]?.endsWith('deadline-scanner.worker.ts')) {
  const targetOrg = process.argv[2];
  const targetDate = process.argv[3];
  console.log('Running standalone manual scan runner...');
  runManualScanDemo(targetOrg, targetDate)
    .then((res) => {
      console.log(
        `Manual scan complete: ${res.scanned} scanned, ${res.alertsCreated} alerts created.`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('Scan error:', err);
      process.exit(1);
    });
}
