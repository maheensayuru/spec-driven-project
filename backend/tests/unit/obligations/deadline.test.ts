import { describe, it, expect } from 'vitest';
import {
  calculateCancellationDeadline,
  calculateNextRenewalDate,
} from '../../../src/modules/obligations/deadline.calculator.js';

describe('Deterministic Date Calculations (Constitution Principle V)', () => {
  describe('calculateCancellationDeadline', () => {
    it('calculates cancellation deadline 30 days prior to renewal date', () => {
      const renewalDate = '2026-11-15';
      const noticeDays = 30;
      const deadline = calculateCancellationDeadline(renewalDate, noticeDays);
      expect(deadline).toBe('2026-10-16');
    });

    it('calculates cancellation deadline crossing month boundaries with 60 days notice', () => {
      const renewalDate = '2026-05-01';
      const noticeDays = 60;
      const deadline = calculateCancellationDeadline(renewalDate, noticeDays);
      expect(deadline).toBe('2026-03-02');
    });

    it('handles leap years accurately (e.g., 2028 leap year)', () => {
      const renewalDate = '2028-03-01';
      const noticeDays = 1;
      const deadline = calculateCancellationDeadline(renewalDate, noticeDays);
      expect(deadline).toBe('2028-02-29');
    });

    it('returns renewal date when notice period is 0 days', () => {
      const renewalDate = '2026-12-31';
      const noticeDays = 0;
      const deadline = calculateCancellationDeadline(renewalDate, noticeDays);
      expect(deadline).toBe('2026-12-31');
    });

    it('throws an error if notice period is negative', () => {
      expect(() => calculateCancellationDeadline('2026-12-31', -5)).toThrowError(
        'Notice period days must be non-negative',
      );
    });
  });

  describe('calculateNextRenewalDate', () => {
    it('advances monthly billing frequency by exactly one month', () => {
      const nextDate = calculateNextRenewalDate('2026-01-15', 'monthly');
      expect(nextDate).toBe('2026-02-15');
    });

    it('advances quarterly billing frequency by exactly three months', () => {
      const nextDate = calculateNextRenewalDate('2026-01-15', 'quarterly');
      expect(nextDate).toBe('2026-04-15');
    });

    it('advances annual billing frequency by exactly one year', () => {
      const nextDate = calculateNextRenewalDate('2026-06-30', 'annual');
      expect(nextDate).toBe('2027-06-30');
    });

    it('advances biennial billing frequency by exactly two years', () => {
      const nextDate = calculateNextRenewalDate('2026-06-30', 'biennial');
      expect(nextDate).toBe('2028-06-30');
    });

    it('handles month-end clamping (e.g. Jan 31 + 1 month in non-leap year = Feb 28)', () => {
      const nextDate = calculateNextRenewalDate('2026-01-31', 'monthly');
      expect(nextDate).toBe('2026-02-28');
    });
  });
});
