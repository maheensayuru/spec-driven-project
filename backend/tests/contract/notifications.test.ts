import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema/index.js';
import { resetTestDatabase, testDb, testClient } from '../helpers/test-database.js';

vi.mock('../../src/db/connection.js', async () => {
  // The async import is required because Vitest hoists mock factories above static imports.
  const { testDb } = await import('../helpers/test-database.js');
  return { db: testDb };
});

import { NotificationService } from '../../src/modules/notifications/notification.service.js';

const orgId = '99999999-8888-4777-8666-555555555555';
const otherOrgId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const userId = '11111111-aaaa-4bbb-8ccc-222222222222';
const obligationId = '33333333-aaaa-4bbb-8ccc-444444444444';
const otherObligationId = '55555555-aaaa-4bbb-8ccc-666666666666';
const alertId = '77777777-aaaa-4bbb-8ccc-888888888888';
const otherAlertId = '99999999-aaaa-4bbb-8ccc-000000000000';

async function seedAlerts(): Promise<void> {
  await testClient.query(
    `INSERT INTO organizations (id, name, slug) VALUES
      ($1, 'Alerts organization', 'alerts-organization'),
      ($2, 'Other alerts organization', 'other-alerts-organization')`,
    [orgId, otherOrgId],
  );
  await testClient.query(
    `INSERT INTO users (id, email, password_hash, full_name)
     VALUES ($1, 'alerts@example.com', 'unused', 'Alerts User')`,
    [userId],
  );
  await testClient.query(
    `INSERT INTO obligations
      (id, organization_id, title, type, status, amount, currency, billing_frequency,
       renewal_date, notice_period_days, cancellation_deadline, auto_renew, risk_level)
     VALUES
      ($1, $2, 'Primary obligation', 'subscription', 'active', 100, 'USD', 'annual',
       '2026-10-01', 30, '2026-09-01', true, 'high'),
      ($3, $4, 'Other obligation', 'subscription', 'active', 100, 'USD', 'annual',
       '2026-10-01', 30, '2026-09-01', true, 'high')`,
    [obligationId, orgId, otherObligationId, otherOrgId],
  );
  await testClient.query(
    `INSERT INTO obligation_alerts
      (id, organization_id, obligation_id, milestone, trigger_date, priority,
       idempotency_key, in_app_delivered, email_delivered)
     VALUES
      ($1, $2, $3, '14_day', '2026-09-05', 'high', $4, true, false),
      ($5, $6, $7, '7_day', '2026-09-05', 'critical', $8, true, false)`,
    [
      alertId,
      orgId,
      obligationId,
      `${orgId}:${obligationId}:14_day:2026-09-05`,
      otherAlertId,
      otherOrgId,
      otherObligationId,
      `${otherOrgId}:${otherObligationId}:7_day:2026-09-05`,
    ],
  );
}

describe('notification persistence', () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedAlerts();
  });

  it('lists only alerts belonging to the requested organization', async () => {
    const alerts = await NotificationService.getOrganizationAlerts(orgId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: alertId, organizationId: orgId });
  });

  it('persists acknowledgement without permitting cross-tenant access', async () => {
    expect(await NotificationService.acknowledgeAlert(otherOrgId, alertId, userId)).toBe(false);
    expect(await NotificationService.acknowledgeAlert(orgId, alertId, userId)).toBe(true);

    const [persisted] = await testDb
      .select()
      .from(schema.obligationAlerts)
      .where(eq(schema.obligationAlerts.id, alertId));
    expect(persisted?.acknowledgedBy).toBe(userId);
    expect(persisted?.acknowledgedAt).toBeInstanceOf(Date);
  });

  it('propagates notification database failures instead of fabricating success', async () => {
    const [alert] = await NotificationService.getOrganizationAlerts(orgId);
    expect(alert).toBeDefined();

    await testClient.exec('DROP TABLE obligation_alerts');
    await expect(NotificationService.getOrganizationAlerts(orgId)).rejects.toThrow();
    await expect(NotificationService.acknowledgeAlert(orgId, alertId, userId)).rejects.toThrow();
    await expect(
      NotificationService.dispatchEmailAlert('recipient@example.com', alert!, 'Primary obligation'),
    ).rejects.toThrow();
  });
});
