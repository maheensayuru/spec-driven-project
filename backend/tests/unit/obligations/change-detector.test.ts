import { describe, it, expect } from 'vitest';
import {
  ContractChangeService,
  ExistingContractSnapshot,
  IncomingContractTerms,
} from '../../../src/modules/obligations/change-detector.service.js';

describe('Contract Change & Price Escalation Detection (User Story 6 & Clarification 3)', () => {
  const baseContract: ExistingContractSnapshot = {
    amount: 10000,
    currency: 'USD',
    billingFrequency: 'annual',
    noticePeriodDays: 60,
    autoRenew: true,
  };

  it('flags price increase >= 2% or >= $50 as significant change with under_review recommendation', () => {
    // 25% price increase from $10,000 to $12,500
    const incoming: IncomingContractTerms = {
      amount: 12500,
      currency: 'USD',
      billingFrequency: 'annual',
      noticePeriodDays: 60,
      autoRenew: true,
    };

    const diff = ContractChangeService.evaluateDiff(baseContract, incoming);

    expect(diff.hasSignificantChanges).toBe(true);
    expect(diff.priceDelta).toBe(2500);
    expect(diff.pricePercentChange).toBe(25);
    expect(diff.suggestedStatus).toBe('under_review');
    expect(diff.warnings).toContain('Price increase detected: +$2500 (+25.0%)');
  });

  it('ignores minor rounding fluctuations under 2% and under $50', () => {
    // $10,000 to $10,010 (+0.1% and +$10)
    const incoming: IncomingContractTerms = {
      amount: 10010,
      currency: 'USD',
      billingFrequency: 'annual',
      noticePeriodDays: 60,
      autoRenew: true,
    };

    const diff = ContractChangeService.evaluateDiff(baseContract, incoming);

    expect(diff.hasSignificantChanges).toBe(false);
    expect(diff.suggestedStatus).toBe('active');
  });

  it('flags reduction in notice period as a critical contractual risk', () => {
    // Notice period reduced from 60 days to 30 days
    const incoming: IncomingContractTerms = {
      amount: 10000,
      currency: 'USD',
      billingFrequency: 'annual',
      noticePeriodDays: 30, // Reduced notice period
      autoRenew: true,
    };

    const diff = ContractChangeService.evaluateDiff(baseContract, incoming);

    expect(diff.hasSignificantChanges).toBe(true);
    expect(diff.noticePeriodDelta).toBe(-30);
    expect(diff.suggestedStatus).toBe('under_review');
    expect(diff.warnings).toContain('Notice period reduced by 30 days (from 60 to 30)');
  });

  it('flags alteration of auto-renewal clause', () => {
    const incoming: IncomingContractTerms = {
      amount: 10000,
      currency: 'USD',
      billingFrequency: 'annual',
      noticePeriodDays: 60,
      autoRenew: false, // Changed from true to false
    };

    const diff = ContractChangeService.evaluateDiff(baseContract, incoming);

    expect(diff.hasSignificantChanges).toBe(true);
    expect(diff.autoRenewChanged).toBe(true);
    expect(diff.warnings).toContain('Auto-renewal status changed from true to false');
  });
});
