import { db } from '../../db/connection.js';
import * as schema from '../../db/schema/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import type { Obligation } from '../../db/schema/obligations.js';
import { RiskEvaluationService } from './risk.service.js';

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
  ): {
    milestone: Milestone;
    priority: 'critical' | 'high' | 'medium' | 'low';
    escalateToAdmins: boolean;
  } | null {
    if (obligation.status !== 'active' || obligation.deletedAt) {
      return null;
    }

    const refDate = referenceDateStr ? new Date(referenceDateStr + 'T00:00:00Z') : new Date();
    refDate.setUTCHours(0, 0, 0, 0);

    const deadline = new Date(obligation.cancellationDeadline + 'T00:00:00Z');
    const daysToDeadline = Math.round(
      (deadline.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysToDeadline < 0) {
      return {
        milestone: 'overdue',
        priority: 'critical',
        escalateToAdmins: true,
      };
    }

    const milestone = this.MILESTONE_DAYS[daysToDeadline];
    if (milestone) {
      const priority = RiskEvaluationService.evaluate({
        renewalDate: obligation.renewalDate,
        cancellationDeadline: obligation.cancellationDeadline,
        amount: Number(obligation.amount),
        autoRenew: obligation.autoRenew,
        internalOwnerId: obligation.internalOwnerId,
        referenceDate: referenceDateStr,
      });

      // Tiered escalation (Clarification 1): escalate to Admins/Owner if <= 3 days
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
   * Pure in-memory scanner mapping obligations to idempotent alerts.
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

  /**
   * Database-backed scanner executing for a specific organization or all organizations.
   * Safe for daily BullMQ worker execution or development-only demo triggers (Task T034).
   */
  static async runScan(
    targetOrganizationId?: string,
    referenceDateStr?: string,
  ): Promise<{ scanned: number; alertsCreated: number }> {
    const refDate = referenceDateStr ?? new Date().toISOString().split('T')[0] ?? '2026-09-05';

    const conditions = [
      eq(schema.obligations.status, 'active'),
      isNull(schema.obligations.deletedAt),
    ];

    if (targetOrganizationId) {
      conditions.push(eq(schema.obligations.organizationId, targetOrganizationId));
    }

    const activeObligations = await db
      .select()
      .from(schema.obligations)
      .where(and(...conditions));

    let alertsCreated = 0;

    for (const obligation of activeObligations) {
      const evaluation = this.evaluateObligation(obligation, refDate);
      if (!evaluation) {
        continue;
      }

      const idempotencyKey = this.generateIdempotencyKey(
        obligation.organizationId,
        obligation.id,
        evaluation.milestone,
        refDate,
      );

      const inserted = await db
        .insert(schema.obligationAlerts)
        .values({
          organizationId: obligation.organizationId,
          obligationId: obligation.id,
          milestone: evaluation.milestone,
          triggerDate: refDate,
          priority: evaluation.priority,
          idempotencyKey,
          inAppDelivered: true,
          emailDelivered: false,
        })
        .onConflictDoNothing({ target: schema.obligationAlerts.idempotencyKey })
        .returning();

      if (inserted.length > 0) {
        alertsCreated++;
      }
    }

    return {
      scanned: activeObligations.length,
      alertsCreated,
    };
  }
}
