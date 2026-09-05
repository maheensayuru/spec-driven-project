import { describe, it, expect } from 'vitest';
import { ContractChangeService } from '../../../src/modules/obligations/change-detector.service.js';
import { Obligation } from '../../../src/db/schema/obligations.js';

describe('Contract Amendment Linking & Change Detection Integration (User Story 6)', () => {
  const existingObligation: Obligation = {
    id: 'obl-base-1',
    organizationId: 'org-test-1',
    vendorId: null,
    title: 'Datadog APM & Log Management',
    type: 'subscription',
    status: 'active',
    amount: '10000.00',
    currency: 'USD',
    billingFrequency: 'annual',
    startDate: '2025-10-01',
    renewalDate: '2026-10-01',
    expirationDate: null,
    noticePeriodDays: 60,
    cancellationDeadline: '2026-08-02',
    autoRenew: true,
    riskLevel: 'medium',
    internalOwnerId: null,
    tags: ['monitoring'],
    notes: null,
    version: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('detects contract amendment terms and recommends under_review status', () => {
    // Newly uploaded renewal quote has price increase +25% and reduced notice
    const incomingAmendment = {
      amount: 12500,
      currency: 'USD',
      billingFrequency: 'annual',
      noticePeriodDays: 30, // Reduced from 60
      autoRenew: true,
    };

    const diff = ContractChangeService.evaluateDiff(
      {
        amount: Number(existingObligation.amount),
        currency: existingObligation.currency,
        billingFrequency: existingObligation.billingFrequency,
        noticePeriodDays: existingObligation.noticePeriodDays,
        autoRenew: existingObligation.autoRenew,
      },
      incomingAmendment,
    );

    expect(diff.hasSignificantChanges).toBe(true);
    expect(diff.suggestedStatus).toBe('under_review');
    expect(diff.priceDelta).toBe(2500);
    expect(diff.pricePercentChange).toBe(25);
    expect(diff.noticePeriodDelta).toBe(-30);
    expect(diff.warnings.length).toBe(2);
  });
});
