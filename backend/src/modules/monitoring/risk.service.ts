export interface RiskEvaluationInput {
  renewalDate: string;
  cancellationDeadline: string;
  amount: number;
  autoRenew?: boolean;
  internalOwnerId?: string | null;
  referenceDate?: string;
}

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export class RiskEvaluationService {
  /**
   * Deterministically calculates the risk level for an obligation (FR-011 & Task T033).
   * Rules from frozen specification:
   * - CRITICAL: Cancellation deadline <= 7 days OR (cancellation deadline <= 14 days AND annual amount >= $10,000)
   * - HIGH: Cancellation deadline <= 30 days OR auto-renewing without confirmed internal owner
   * - MEDIUM: Renewal deadline <= 60 days
   * - LOW: Renewal deadline > 60 days
   */
  static evaluate(input: RiskEvaluationInput): RiskLevel {
    const today = input.referenceDate ? new Date(input.referenceDate + 'T00:00:00Z') : new Date();
    today.setUTCHours(0, 0, 0, 0);

    const deadline = new Date(input.cancellationDeadline + 'T00:00:00Z');
    const daysToDeadline = Math.round(
      (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Critical Priority
    if (daysToDeadline <= 7 || (daysToDeadline <= 14 && input.amount >= 10000)) {
      return 'critical';
    }

    // High Priority
    if (daysToDeadline <= 30) {
      return 'high';
    }
    if (input.autoRenew && !input.internalOwnerId) {
      return 'high';
    }

    // Medium Priority
    const renewal = new Date(input.renewalDate + 'T00:00:00Z');
    const daysToRenewal = Math.round((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysToRenewal <= 60) {
      return 'medium';
    }

    // Low Priority
    return 'low';
  }
}
