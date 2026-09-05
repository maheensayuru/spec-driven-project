import { describe, it, expect } from 'vitest';
import {
  EntitlementService,
  PlanTier,
  TIER_LIMITS,
} from '../../../src/modules/entitlements/entitlement.service.js';

describe('Subscription Tiers & Entitlements Engine (User Story 7 & FR-024, FR-025)', () => {
  it('defines the correct plan quota limits for Free, Business, and Pro', () => {
    expect(TIER_LIMITS.free.maxObligations).toBe(10);
    expect(TIER_LIMITS.free.monthlyAiExtractions).toBe(0);
    expect(TIER_LIMITS.free.allowAutomatedEmailAlerts).toBe(false);

    expect(TIER_LIMITS.business.maxObligations).toBe(100);
    expect(TIER_LIMITS.business.monthlyAiExtractions).toBe(25);
    expect(TIER_LIMITS.business.allowAutomatedEmailAlerts).toBe(true);

    expect(TIER_LIMITS.pro.maxObligations).toBe(Infinity);
    expect(TIER_LIMITS.pro.monthlyAiExtractions).toBe(150);
    expect(TIER_LIMITS.pro.allowAutomatedEmailAlerts).toBe(true);
  });

  it('allows obligation creation when under plan limit', () => {
    const result = EntitlementService.checkObligationQuota(5, 'free');
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(5);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(5);
  });

  it('blocks obligation creation when tenant hits plan limit and provides upgrade guidance', () => {
    const result = EntitlementService.checkObligationQuota(10, 'free');
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(10);
    expect(result.upgradeRequired).toBe(true);
    expect(result.suggestedTier).toBe('business');
    expect(result.message).toContain('Free tier limit of 10 obligations reached');
  });

  it('allows unlimited obligations for Pro tier', () => {
    const result = EntitlementService.checkObligationQuota(5000, 'pro');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
  });
});
