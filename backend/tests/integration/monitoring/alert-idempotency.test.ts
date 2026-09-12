import { describe, it, expect } from 'vitest';
import {
  DeadlineScannerService,
  GeneratedAlert,
} from '../../../src/modules/monitoring/scanner.service.js';
import { Obligation } from '../../../src/db/schema/obligations.js';

describe('Deadline Alert Generation & Idempotency Integration Tests (Task T031 & FR-013)', () => {
  const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  function mockObligation(overrides: Partial<Obligation>): Obligation {
    return {
      id: `obl-${Math.random().toString(36).substring(2, 6)}`,
      organizationId: orgA,
      vendorId: null,
      title: 'Monitored SaaS Contract',
      type: 'subscription',
      status: 'active',
      amount: '7500.00',
      currency: 'USD',
      billingFrequency: 'annual',
      startDate: null,
      renewalDate: '2026-10-15',
      expirationDate: null,
      noticePeriodDays: 30,
      cancellationDeadline: '2026-09-15',
      autoRenew: true,
      riskLevel: 'medium',
      internalOwnerId: 'user-owner',
      tags: [],
      notes: null,
      version: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('generates an alert on the first scanner run when milestone matches', () => {
    const scanDate = '2026-09-01'; // 14 days before 2026-09-15
    const obl = mockObligation({ cancellationDeadline: '2026-09-15' });

    const existingKeys = new Set<string>();
    const alerts = DeadlineScannerService.scanObligations([obl], existingKeys, scanDate);

    expect(alerts.length).toBe(1);
    expect(alerts[0]?.milestone).toBe('14_day');
    expect(alerts[0]?.idempotencyKey).toBe(`${orgA}:${obl.id}:14_day:2026-09-01`);
  });

  it('guarantees zero duplicate alerts upon immediate re-run (idempotency)', () => {
    const scanDate = '2026-09-01';
    const obl = mockObligation({ cancellationDeadline: '2026-09-15' });

    const existingKeys = new Set<string>();
    // First execution
    const firstRun = DeadlineScannerService.scanObligations([obl], existingKeys, scanDate);
    expect(firstRun.length).toBe(1);

    // Re-run with the same tracked keys
    const secondRun = DeadlineScannerService.scanObligations([obl], existingKeys, scanDate);
    expect(secondRun.length).toBe(0);

    // Third re-run (e.g. queue retry after network glitch)
    const thirdRun = DeadlineScannerService.scanObligations([obl], existingKeys, scanDate);
    expect(thirdRun.length).toBe(0);
  });

  it('allows a separate legitimate milestone alert on a subsequent date (e.g. 7-day milestone)', () => {
    const obl = mockObligation({ cancellationDeadline: '2026-09-15' });
    const existingKeys = new Set<string>();

    // 14-day scan on Sep 1
    const alertsDay14 = DeadlineScannerService.scanObligations([obl], existingKeys, '2026-09-01');
    expect(alertsDay14.length).toBe(1);
    expect(alertsDay14[0]?.milestone).toBe('14_day');

    // 7-day scan on Sep 8 (legitimate subsequent milestone)
    const alertsDay7 = DeadlineScannerService.scanObligations([obl], existingKeys, '2026-09-08');
    expect(alertsDay7.length).toBe(1);
    expect(alertsDay7[0]?.milestone).toBe('7_day');
    expect(alertsDay7[0]?.priority).toBe('critical');

    // Attempting to re-run Sep 8 scan yields 0 duplicates
    const rerunDay7 = DeadlineScannerService.scanObligations([obl], existingKeys, '2026-09-08');
    expect(rerunDay7.length).toBe(0);
  });

  it('enforces tenant scoping: Org A and Org B scan obligations independently', () => {
    const oblA = mockObligation({
      id: 'obl-a',
      organizationId: orgA,
      cancellationDeadline: '2026-09-15',
    });
    const oblB = mockObligation({
      id: 'obl-b',
      organizationId: orgB,
      cancellationDeadline: '2026-09-15',
    });

    const existingKeys = new Set<string>();
    const alerts = DeadlineScannerService.scanObligations([oblA, oblB], existingKeys, '2026-09-01');

    expect(alerts.length).toBe(2);
    expect(alerts.find((a) => a.organizationId === orgA)?.obligationId).toBe('obl-a');
    expect(alerts.find((a) => a.organizationId === orgB)?.obligationId).toBe('obl-b');
  });

  it('strictly ignores inactive and archived obligations during scanning', () => {
    const activeObl = mockObligation({ status: 'active', cancellationDeadline: '2026-09-15' });
    const archivedObl = mockObligation({ status: 'archived', cancellationDeadline: '2026-09-15' });
    const terminatedObl = mockObligation({
      status: 'terminated',
      cancellationDeadline: '2026-09-15',
    });

    const existingKeys = new Set<string>();
    const alerts = DeadlineScannerService.scanObligations(
      [activeObl, archivedObl, terminatedObl],
      existingKeys,
      '2026-09-01',
    );

    expect(alerts.length).toBe(1);
    expect(alerts[0]?.obligationId).toBe(activeObl.id);
  });
});
