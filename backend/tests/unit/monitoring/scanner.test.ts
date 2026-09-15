import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Obligation } from '../../../src/db/schema/obligations.js';
import { resetTestDatabase, testClient } from '../../helpers/test-database.js';

vi.mock('../../../src/db/connection.js', async () => {
  // The async import is required because Vitest hoists mock factories above static imports.
  const { testDb } = await import('../../helpers/test-database.js');
  return { db: testDb };
});

import { DeadlineScannerService } from '../../../src/modules/monitoring/scanner.service.js';

describe('Deadline Monitoring Scanner & Alert Idempotency (Constitution Principle IV & FR-010-FR-013)', () => {
  const refDate = '2026-09-05';
  const orgId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    await resetTestDatabase();
  });

  function mockObligation(overrides: Partial<Obligation>): Obligation {
    return {
      id: `obl-${Math.random().toString(36).substring(2, 6)}`,
      organizationId: orgId,
      vendorId: null,
      title: 'Test Subscription',
      type: 'subscription',
      status: 'active',
      amount: '5000.00',
      currency: 'USD',
      billingFrequency: 'annual',
      startDate: null,
      renewalDate: '2026-10-05',
      expirationDate: null,
      noticePeriodDays: 30,
      cancellationDeadline: '2026-09-19', // Exactly 14 days after 2026-09-05
      autoRenew: true,
      riskLevel: 'medium',
      internalOwnerId: null,
      tags: [],
      notes: null,
      version: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('detects a 14-day notice deadline milestone', () => {
    const obligation = mockObligation({ cancellationDeadline: '2026-09-19' }); // +14 days
    const evaluation = DeadlineScannerService.evaluateObligation(obligation, refDate);

    expect(evaluation).not.toBeNull();
    expect(evaluation?.milestone).toBe('14_day');
    expect(evaluation?.priority).toBe('high');
  });

  it('marks a 7-day milestone as critical priority', () => {
    const obligation = mockObligation({ cancellationDeadline: '2026-09-12' }); // +7 days
    const evaluation = DeadlineScannerService.evaluateObligation(obligation, refDate);

    expect(evaluation).not.toBeNull();
    expect(evaluation?.milestone).toBe('7_day');
    expect(evaluation?.priority).toBe('critical');
  });

  it('detects an overdue obligation if cancellation deadline has passed', () => {
    const obligation = mockObligation({ cancellationDeadline: '2026-09-01' }); // 4 days ago
    const evaluation = DeadlineScannerService.evaluateObligation(obligation, refDate);

    expect(evaluation).not.toBeNull();
    expect(evaluation?.milestone).toBe('overdue');
    expect(evaluation?.priority).toBe('critical');
    expect(evaluation?.escalateToAdmins).toBe(true);
  });

  it('guarantees idempotency: re-running scan on same date emits zero duplicate alerts', () => {
    const obligation1 = mockObligation({ id: 'obl-1', cancellationDeadline: '2026-09-19' }); // 14-day
    const obligation2 = mockObligation({ id: 'obl-2', cancellationDeadline: '2026-09-12' }); // 7-day

    const existingKeys = new Set<string>();

    // First scan: generates 2 alerts
    const firstScan = DeadlineScannerService.scanObligations(
      [obligation1, obligation2],
      existingKeys,
      refDate,
    );
    expect(firstScan.length).toBe(2);
    expect(existingKeys.size).toBe(2);

    // Second scan with same set of keys: emits 0 alerts
    const secondScan = DeadlineScannerService.scanObligations(
      [obligation1, obligation2],
      existingKeys,
      refDate,
    );
    expect(secondScan.length).toBe(0);
    expect(existingKeys.size).toBe(2);
  });

  it('persists idempotent alerts while scanning only the requested organization', async () => {
    const otherOrgId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    await testClient.query(
      `INSERT INTO organizations (id, name, slug) VALUES
        ($1, 'Scanner organization', 'scanner-organization'),
        ($2, 'Other scanner organization', 'other-scanner-organization')`,
      [orgId, otherOrgId],
    );
    await testClient.query(
      `INSERT INTO obligations
        (organization_id, title, type, status, amount, currency, billing_frequency,
         renewal_date, notice_period_days, cancellation_deadline, auto_renew, risk_level)
       VALUES
        ($1, 'Scanned obligation', 'subscription', 'active', 100, 'USD', 'annual',
         '2026-10-01', 30, '2026-09-19', true, 'high'),
        ($2, 'Other obligation', 'subscription', 'active', 100, 'USD', 'annual',
         '2026-10-01', 30, '2026-09-19', true, 'high')`,
      [orgId, otherOrgId],
    );

    await expect(DeadlineScannerService.runScan(orgId, refDate)).resolves.toEqual({
      scanned: 1,
      alertsCreated: 1,
    });
    await expect(DeadlineScannerService.runScan(orgId, refDate)).resolves.toEqual({
      scanned: 1,
      alertsCreated: 0,
    });

    const alerts = await testClient.query<{ organization_id: string }>(
      'SELECT organization_id FROM obligation_alerts',
    );
    expect(alerts.rows).toEqual([{ organization_id: orgId }]);
  });

  it('propagates database failures instead of reporting a successful empty scan', async () => {
    await testClient.exec('DROP TABLE obligations CASCADE');
    await expect(DeadlineScannerService.runScan(orgId, refDate)).rejects.toThrow();
  });
});
