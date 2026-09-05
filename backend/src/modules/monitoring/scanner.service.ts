import { Obligation } from '../../db/schema/obligations.js';

export type Milestone = '90_day' | '60_day' | '30_day' | '14_day' | '7_day' | '1_day' | 'overdue';

export interface GeneratedAlert {
  id: string;
  organizationId: string;
  obligationId: string;
  milestone: Milestone;
  triggerDate: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  idempotencyKey: string;
  escalateToAdmins: boolean;
  createdAt: Date;
}

export class DeadlineScannerService {
  private static readonly MILESTONE_DAYS: Record<number, Milestone> = {
    90: '90_day',
    60: '60_day',
    30: '30_day',
    14: '14_day',
    7: '7_day',
    1: '1_day',
  };

  /**
   * Generates a deterministic idempotency key for alert deduplication (Constitution Principle IV).
   * Format: {org_id}:{obligation_id}:{milestone}:{trigger_date}
   */
  static generateIdempotencyKey(
    organizationId: string,
    obligationId: string,
    milestone: Milestone,
    triggerDate: string,
  ): string {
    return `${organizationId}:${obligationId}:${milestone}:${triggerDate}`;
  }

  /**
   * Evaluates an obligation on a specific reference date (defaults to UTC today)
   * and determines if a notification milestone has been reached.
   */
  static evaluateObligation(
    obligation: Obligation,
    referenceDateStr?: string,
  ): { milestone: Milestone; priority: 'critical' | 'high' | 'medium' | 'low'; escalateToAdmins: boolean } | null {
    if (obligation.status !== 'active' || obligation.deletedAt) {
      return null;
    }

    const refDate = referenceDateStr ? new Date(referenceDateStr + 'T00:00:00Z') : new Date();
    refDate.setUTCHours(0, 0, 0, 0);

    const deadline = new Date(obligation.cancellationDeadline + 'T00:00:00Z');
    const daysToDeadline = Math.round((deadline.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysToDeadline < 0) {
      return {
        milestone: 'overdue',
        priority: 'critical',
        escalateToAdmins: true,
      };
    }

    // Check specific milestone triggers
    const milestone = this.MILESTONE_DAYS[daysToDeadline];
    if (milestone) {
      const isUrgent = daysToDeadline <= 7;
      const isHighValue = Number(obligation.amount) >= 10000;
      const priority = isUrgent || (daysToDeadline <= 14 && isHighValue) ? 'critical' : daysToDeadline <= 30 ? 'high' : 'medium';
      
      // Tiered escalation (Clarification 1): escalate if <= 3 days or critical
      const escalateToAdmins = daysToDeadline <= 3;

      return {
        milestone,
        priority,
        escalateToAdmins,
      };
    }

    return null;
  }

  /**
   * Scans a collection of active obligations and emits idempotent alerts,
   * guaranteeing that duplicate alerts are not generated.
   */
  static scanObligations(
    obligations: Obligation[],
    existingIdempotencyKeys: Set<string>,
    referenceDateStr: string,
  ): GeneratedAlert[] {
    const alerts: GeneratedAlert[] = [];

    for (const obligation of obligations) {
      const evaluation = this.evaluateObligation(obligation, referenceDateStr);
      if (!evaluation) {
        continue;
      }

      const idempotencyKey = this.generateIdempotencyKey(
        obligation.organizationId,
        obligation.id,
        evaluation.milestone,
        referenceDateStr,
      );

      // Deduplication check: if key already emitted, skip
      if (existingIdempotencyKeys.has(idempotencyKey)) {
        continue;
      }

      existingIdempotencyKeys.add(idempotencyKey);

      alerts.push({
        id: `alert-${Math.random().toString(36).substring(2, 9)}`,
        organizationId: obligation.organizationId,
        obligationId: obligation.id,
        milestone: evaluation.milestone,
        triggerDate: referenceDateStr,
        priority: evaluation.priority,
        idempotencyKey,
        escalateToAdmins: evaluation.escalateToAdmins,
        createdAt: new Date(),
      });
    }

    return alerts;
  }
}
