export type PlanTier = 'free' | 'business' | 'pro';

export interface TierEntitlement {
  maxObligations: number;
  monthlyAiExtractions: number;
  allowAutomatedEmailAlerts: boolean;
  priorityMonitoring: boolean;
}

export const TIER_LIMITS: Record<PlanTier, TierEntitlement> = {
  free: {
    maxObligations: 10,
    monthlyAiExtractions: 0,
    allowAutomatedEmailAlerts: false,
    priorityMonitoring: false,
  },
  business: {
    maxObligations: 100,
    monthlyAiExtractions: 25,
    allowAutomatedEmailAlerts: true,
    priorityMonitoring: false,
  },
  pro: {
    maxObligations: Infinity,
    monthlyAiExtractions: 150,
    allowAutomatedEmailAlerts: true,
    priorityMonitoring: true,
  },
};

export interface QuotaCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  remaining: number;
  upgradeRequired?: boolean;
  suggestedTier?: PlanTier;
  message?: string;
}

export class EntitlementService {
  /**
   * Evaluates if a tenant has remaining obligation capacity under their active plan tier (FR-024).
   */
  static checkObligationQuota(currentCount: number, tier: PlanTier): QuotaCheckResult {
    const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
    const limit = limits.maxObligations;
    const remaining = limit === Infinity ? Infinity : Math.max(0, limit - currentCount);

    if (currentCount >= limit) {
      const suggestedTier: PlanTier = tier === 'free' ? 'business' : 'pro';
      return {
        allowed: false,
        currentCount,
        limit,
        remaining: 0,
        upgradeRequired: true,
        suggestedTier,
        message: `${tier.charAt(0).toUpperCase() + tier.slice(1)} tier limit of ${limit} obligations reached. Upgrade to ${suggestedTier} to add more.`,
      };
    }

    return {
      allowed: true,
      currentCount,
      limit,
      remaining,
    };
  }

  /**
   * Evaluates if a tenant has remaining monthly AI extraction capacity under their plan.
   */
  static checkExtractionQuota(usedThisMonth: number, tier: PlanTier): QuotaCheckResult {
    const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
    const limit = limits.monthlyAiExtractions;
    const remaining = Math.max(0, limit - usedThisMonth);

    if (usedThisMonth >= limit) {
      const suggestedTier: PlanTier = tier === 'free' ? 'business' : 'pro';
      return {
        allowed: false,
        currentCount: usedThisMonth,
        limit,
        remaining: 0,
        upgradeRequired: true,
        suggestedTier,
        message: `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan allows ${limit} monthly AI extractions. Please upgrade to ${suggestedTier}.`,
      };
    }

    return {
      allowed: true,
      currentCount: usedThisMonth,
      limit,
      remaining,
    };
  }
}
