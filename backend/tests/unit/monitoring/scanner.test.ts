import { describe, it, expect } from 'vitest';
import { DeadlineScannerService } from '../../../src/modules/monitoring/scanner.service.js';
import { Obligation } from '../../../src/db/schema/obligations.js';

describe('Deadline Monitoring Scanner & Alert Idempotency (Constitution Principle IV & FR-010-FR-013)', () => {
  const refDate = '2026-09-05';
  const orgId = '11111111-1111-1111-1111-111111111111';

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
});
