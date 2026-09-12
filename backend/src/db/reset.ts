import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { BOOTSTRAP_SQL } from './bootstrap.js';
import { seedDatabase } from './seed.js';

export async function resetDemoDatabase(): Promise<void> {
  // CRITICAL PRODUCTION SAFEGUARD
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: Database reset is strictly forbidden in production environment.');
  }

  console.log('[RESET] Starting safe development demo reset...');

  const dataDir = path.resolve(process.cwd(), '.data/postgres');
  fs.mkdirSync(dataDir, { recursive: true });

  const client = new PGlite(dataDir);

  try {
    console.log('[RESET] Applying PostgreSQL 16 DDL schema...');
    await client.exec(BOOTSTRAP_SQL);

    // Clean existing tables
    console.log('[RESET] Truncating development records...');
    await client.exec(`
      TRUNCATE TABLE audit_events, contract_change_diffs, extraction_stagings,
                     documents, obligation_alerts, organization_invitations,
                     obligations, vendors, organization_members, subscription_entitlements,
                     users, organizations CASCADE;
    `);

    console.log('[RESET] Seeding canonical Acme Distribution Logistics dataset...');
    await seedDatabase();

    console.log('[RESET] Demo reset complete: Clean development state restored.');
  } finally {
    await client.close();
  }
}

if (process.argv[1]?.endsWith('reset.ts')) {
  resetDemoDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[RESET ERROR]:', err);
      process.exit(1);
    });
}
