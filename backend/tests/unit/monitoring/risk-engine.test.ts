import { describe, it, expect } from 'vitest';
import { RiskEvaluationService } from '../../../src/modules/monitoring/risk.service.js';

describe('Deterministic Risk Level Engine (Task T030 & FR-011)', () => {
  const refDate = '2026-09-01';

  it('assigns CRITICAL risk when cancellation deadline is <= 7 days away', () => {
    // 2026-09-01 + 6 days = 2026-09-07
    const risk = RiskEvaluationService.evaluate({
      renewalDate: '2026-10-01',
      cancellationDeadline: '2026-09-07',
      amount: 1000,
      autoRenew: true,
      internalOwnerId: 'user-1',
      referenceDate: refDate,
    });

    expect(risk).toBe('critical');
  });

  it('assigns CRITICAL risk when cancellation deadline is <= 14 days and annual spend is >= $10,000', () => {
    // 2026-09-01 + 12 days = 2026-09-13
    const risk = RiskEvaluationService.evaluate({
      renewalDate: '2026-10-15',
      cancellationDeadline: '2026-09-13',
      amount: 15000, // High annual value >= 10,000
      autoRenew: true,
      internalOwnerId: 'user-1',
      referenceDate: refDate,
    });

    expect(risk).toBe('critical');
  });

  it('assigns HIGH risk when cancellation deadline is <= 30 days away (and not critical)', () => {
    // 2026-09-01 + 25 days = 2026-09-26
    const risk = RiskEvaluationService.evaluate({
      renewalDate: '2026-10-31',
      cancellationDeadline: '2026-09-26',
      amount: 3000,
      autoRenew: true,
      internalOwnerId: 'user-1',
      referenceDate: refDate,
    });

    expect(risk).toBe('high');
  });

  it('assigns HIGH risk when obligation is auto-renewing without a confirmed internal owner', () => {
    // Even if renewal is far away, auto-renew with no owner is high organizational risk
    const risk = RiskEvaluationService.evaluate({
      renewalDate: '2027-01-15',
      cancellationDeadline: '2026-12-15',
      amount: 2500,
      autoRenew: true,
      internalOwnerId: null, // No confirmed owner
      referenceDate: refDate,
    });

    expect(risk).toBe('high');
  });

  it('assigns MEDIUM risk when renewal deadline is <= 60 days away', () => {
    // 2026-09-01 + 55 days = 2026-10-26
    const risk = RiskEvaluationService.evaluate({
      renewalDate: '2026-10-26',
      cancellationDeadline: '2026-10-10', // cancellation deadline > 30 days (40 days away)
      amount: 1200,
      autoRenew: false,
      internalOwnerId: 'user-1',
      referenceDate: refDate,
    });

    expect(risk).toBe('medium');
  });

  it('assigns LOW risk when renewal deadline is > 60 days away', () => {
    // 2026-09-01 + 180 days = 2027-02-28
    const risk = RiskEvaluationService.evaluate({
      renewalDate: '2027-02-28',
      cancellationDeadline: '2027-01-28',
      amount: 1200,
      autoRenew: false,
      internalOwnerId: 'user-1',
      referenceDate: refDate,
    });

    expect(risk).toBe('low');
  });
});
