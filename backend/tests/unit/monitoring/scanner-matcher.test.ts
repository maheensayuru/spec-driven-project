import { describe, it, expect } from 'vitest';
import { DeadlineScannerService } from '../../../src/modules/monitoring/scanner.service.js';
import { Obligation } from '../../../src/db/schema/obligations.js';

describe('Scanner Window Matching & Boundary Tests (Task T029 & FR-012)', () => {
  const refDate = '2026-09-15';
  const orgId = '11111111-1111-1111-1111-111111111111';

  function createTestObligation(overrides: Partial<Obligation>): Obligation {
    return {
      id: 'obl-test-1',
      organizationId: orgId,
      vendorId: null,
      title: 'Scanner Test Obligation',
      type: 'subscription',
      status: 'active',
      amount: '5000.00',
      currency: 'USD',
      billingFrequency: 'annual',
      startDate: null,
      renewalDate: '2026-12-31',
      expirationDate: null,
      noticePeriodDays: 30,
      cancellationDeadline: '2026-12-01',
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

  it('matches 90-day milestone exactly (cancellation deadline = refDate + 90 days)', () => {
    // 2026-09-15 + 90 days = 2026-12-14
    const obl = createTestObligation({ cancellationDeadline: '2026-12-14' });
    const match = DeadlineScannerService.evaluateObligation(obl, refDate);

    expect(match).not.toBeNull();
    expect(match?.milestone).toBe('90_day');
  });

  it('matches 60-day milestone exactly (cancellation deadline = refDate + 60 days)', () => {
    // 2026-09-15 + 60 days = 2026-11-14
    const obl = createTestObligation({ cancellationDeadline: '2026-11-14' });
    const match = DeadlineScannerService.evaluateObligation(obl, refDate);

    expect(match).not.toBeNull();
    expect(match?.milestone).toBe('60_day');
  });

  it('matches 30-day milestone exactly', () => {
    // 2026-09-15 + 30 days = 2026-10-15
    const obl = createTestObligation({ cancellationDeadline: '2026-10-15' });
    const match = DeadlineScannerService.evaluateObligation(obl, refDate);

    expect(match).not.toBeNull();
    expect(match?.milestone).toBe('30_day');
  });

  it('matches 14-day milestone exactly', () => {
    // 2026-09-15 + 14 days = 2026-09-29
    const obl = createTestObligation({ cancellationDeadline: '2026-09-29' });
    const match = DeadlineScannerService.evaluateObligation(obl, refDate);

    expect(match).not.toBeNull();
    expect(match?.milestone).toBe('14_day');
  });

  it('matches 7-day milestone exactly', () => {
    // 2026-09-15 + 7 days = 2026-09-22
    const obl = createTestObligation({ cancellationDeadline: '2026-09-22' });
    const match = DeadlineScannerService.evaluateObligation(obl, refDate);

    expect(match).not.toBeNull();
    expect(match?.milestone).toBe('7_day');
  });

  it('matches 1-day milestone exactly (final urgent action window)', () => {
    // 2026-09-15 + 1 day = 2026-09-16
    const obl = createTestObligation({ cancellationDeadline: '2026-09-16' });
    const match = DeadlineScannerService.evaluateObligation(obl, refDate);

    expect(match).not.toBeNull();
    expect(match?.milestone).toBe('1_day');
    expect(match?.priority).toBe('critical');
  });

  it('returns null for non-milestone days (e.g. 45 days, 15 days, 8 days remaining)', () => {
    // 2026-09-15 + 15 days = 2026-09-30
    const obl15 = createTestObligation({ cancellationDeadline: '2026-09-30' });
    expect(DeadlineScannerService.evaluateObligation(obl15, refDate)).toBeNull();

    // 2026-09-15 + 45 days = 2026-10-30
    const obl45 = createTestObligation({ cancellationDeadline: '2026-10-30' });
    expect(DeadlineScannerService.evaluateObligation(obl45, refDate)).toBeNull();

    // 2026-09-15 + 8 days = 2026-09-23
    const obl8 = createTestObligation({ cancellationDeadline: '2026-09-23' });
    expect(DeadlineScannerService.evaluateObligation(obl8, refDate)).toBeNull();
  });

  it('flags overdue obligations if cancellation deadline has passed', () => {
    // 2026-09-15 - 3 days = 2026-09-12
    const oblOverdue = createTestObligation({ cancellationDeadline: '2026-09-12' });
    const match = DeadlineScannerService.evaluateObligation(oblOverdue, refDate);

    expect(match).not.toBeNull();
    expect(match?.milestone).toBe('overdue');
    expect(match?.priority).toBe('critical');
    expect(match?.escalateToAdmins).toBe(true);
  });

  it('ignores inactive, archived, or soft-deleted obligations regardless of dates', () => {
    const archivedObl = createTestObligation({
      status: 'archived',
      cancellationDeadline: '2026-09-22', // 7 days away
    });
    expect(DeadlineScannerService.evaluateObligation(archivedObl, refDate)).toBeNull();

    const deletedObl = createTestObligation({
      cancellationDeadline: '2026-09-22',
      deletedAt: new Date(),
    });
    expect(DeadlineScannerService.evaluateObligation(deletedObl, refDate)).toBeNull();

    const terminatedObl = createTestObligation({
      status: 'terminated',
      cancellationDeadline: '2026-09-22',
    });
    expect(DeadlineScannerService.evaluateObligation(terminatedObl, refDate)).toBeNull();
  });
});
