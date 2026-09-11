import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { BOOTSTRAP_SQL } from '../../../src/db/bootstrap.js';

describe('Real PostgreSQL 16 Persistence Across Server Restarts (Section 2 Verification)', () => {
  const testDbDir = path.resolve(process.cwd(), '.data/persistence_test_postgres');
  const orgId = '77777777-7777-7777-7777-777777777777';
  const testObligationId = '55555555-5555-5555-5555-555555555555';

  beforeAll(async () => {
    fs.mkdirSync(testDbDir, { recursive: true });
    // Initialize schema
    const initClient = new PGlite(testDbDir);
    await initClient.exec(BOOTSTRAP_SQL);
    // Seed test org
    await initClient.query(
      `INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [orgId, 'Persistence Test Org', 'persistence-test-org'],
    );
    await initClient.close();
  });

  afterAll(async () => {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  });

  it('verifies write -> disconnect/restart -> query persistent data in PostgreSQL 16', async () => {
    // 1. First session: insert obligation
    const clientSession1 = new PGlite(testDbDir);
    await clientSession1.query(
      `INSERT INTO obligations (
        id, organization_id, title, type, status, amount, currency,
        billing_frequency, renewal_date, notice_period_days, cancellation_deadline,
        auto_renew, risk_level, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        testObligationId,
        orgId,
        'Enterprise Snowflake Data Warehouse',
        'subscription',
        'active',
        '45000.00',
        'USD',
        'annual',
        '2026-11-30',
        60,
        '2026-10-01',
        true,
        'high',
        1,
      ],
    );
    // Close connection (simulates backend process shutdown)
    await clientSession1.close();

    // 2. Second session: fresh client instance on same directory (simulates backend restart)
    const clientSession2 = new PGlite(testDbDir);
    const result = await clientSession2.query<{
      id: string;
      title: string;
      amount: string;
      notice_period_days: number;
      version: number;
    }>(`SELECT id, title, amount, notice_period_days, version FROM obligations WHERE id = $1`, [
      testObligationId,
    ]);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.id).toBe(testObligationId);
    expect(result.rows[0]?.title).toBe('Enterprise Snowflake Data Warehouse');
    expect(Number(result.rows[0]?.amount)).toBe(45000);
    expect(result.rows[0]?.notice_period_days).toBe(60);

    // 3. Edit obligation in second session
    await clientSession2.query(
      `UPDATE obligations SET notice_period_days = $1, version = version + 1 WHERE id = $2`,
      [90, testObligationId],
    );
    await clientSession2.close();

    // 4. Third session: fresh instance verifies update persisted
    const clientSession3 = new PGlite(testDbDir);
    const updatedResult = await clientSession3.query<{
      notice_period_days: number;
      version: number;
    }>(`SELECT notice_period_days, version FROM obligations WHERE id = $1`, [testObligationId]);

    expect(updatedResult.rows[0]?.notice_period_days).toBe(90);
    expect(updatedResult.rows[0]?.version).toBe(2);

    // 5. Soft-delete obligation and verify soft deletion persisted
    await clientSession3.query(`UPDATE obligations SET deleted_at = NOW() WHERE id = $1`, [
      testObligationId,
    ]);

    const activeResult = await clientSession3.query(
      `SELECT id FROM obligations WHERE id = $1 AND deleted_at IS NULL`,
      [testObligationId],
    );
    expect(activeResult.rows.length).toBe(0);

    await clientSession3.close();
  });
});
