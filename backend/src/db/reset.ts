import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { closeDatabase, databaseBackend, db } from './connection.js';
import { migrateDatabase } from './migrate.js';
import { seedDatabase } from './seed.js';

const RESET_SQL = `
  TRUNCATE TABLE audit_events, contract_change_diffs, extraction_stagings,
                 documents, obligation_alerts, organization_invitations,
                 obligations, vendors, organization_members, subscription_entitlements,
                 users, organizations CASCADE;
`;

export async function resetDemoDatabase(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('FATAL: Database reset is strictly forbidden in production environment.');
  }

  console.log(`[RESET] Starting safe development demo reset using ${databaseBackend}...`);
  console.log('[RESET] Applying database migrations...');
  await migrateDatabase();

  console.log('[RESET] Truncating development records...');
  await db.execute(sql.raw(RESET_SQL));

  console.log('[RESET] Seeding canonical Acme Distribution Logistics dataset...');
  await seedDatabase();
  console.log('[RESET] Demo reset complete: Clean development state restored.');
}

const isDirectRun =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  resetDemoDatabase()
    .catch((error: unknown) => {
      console.error('[RESET ERROR]:', error);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}
