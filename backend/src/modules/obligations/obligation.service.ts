import {
  CreateObligationRequest,
  ListObligationsQuery,
  ObligationType,
  BillingFrequency,
} from '@renewalradar/shared';
import { calculateCancellationDeadline, calculateNextRenewalDate } from './deadline.calculator.js';
import { TenantContext } from '../../db/connection.js';
import { Obligation } from '../../db/schema/obligations.js';

export interface ObligationWithVendor extends Obligation {
  vendorName?: string;
}

export class ObligationService {
  /**
   * Deterministically calculates the initial risk level based on days remaining until renewal/notice.
   */
  static calculateRiskLevel(
    renewalDateStr: string,
    cancellationDeadlineStr: string,
    amount: number,
  ): 'critical' | 'high' | 'medium' | 'low' {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const deadline = new Date(cancellationDeadlineStr + 'T00:00:00Z');
    const daysToDeadline = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysToDeadline <= 7 || (daysToDeadline <= 14 && amount >= 10000)) {
      return 'critical';
    }
    if (daysToDeadline <= 30) {
      return 'high';
    }

    const renewal = new Date(renewalDateStr + 'T00:00:00Z');
    const daysToRenewal = Math.ceil((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysToRenewal <= 60) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Creates an obligation with deterministic cancellation deadline and audit trail.
   */
  static async createObligation(
    tenant: TenantContext,
    input: CreateObligationRequest,
    actorId?: string,
  ): Promise<Obligation> {
    const cancellationDeadline = calculateCancellationDeadline(
      input.renewalDate,
      input.noticePeriodDays,
    );

    const riskLevel = this.calculateRiskLevel(
      input.renewalDate,
      cancellationDeadline,
      input.amount,
    );

    const obligation = await tenant.obligations.create({
      title: input.title,
      type: input.type,
      amount: String(input.amount),
      currency: input.currency,
      billingFrequency: input.billingFrequency,
      startDate: input.startDate,
      renewalDate: input.renewalDate,
      expirationDate: input.expirationDate,
      noticePeriodDays: input.noticePeriodDays,
      cancellationDeadline,
      autoRenew: input.autoRenew,
      riskLevel,
      internalOwnerId: input.internalOwnerId,
      tags: input.tags,
      notes: input.notes,
      status: 'active',
      version: 1,
    });

    await tenant.audit.record('obligation', obligation.id, 'created', {
      actorId,
      afterState: obligation as unknown as Record<string, unknown>,
    });

    return obligation;
  }

  /**
   * Lists obligations scoped to the tenant with optional pagination.
   */
  static async listObligations(
    tenant: TenantContext,
    query: ListObligationsQuery,
  ): Promise<Obligation[]> {
    return tenant.obligations.list(query.limit, (query.page - 1) * query.limit);
  }

  /**
   * Retrieves an obligation by ID.
   */
  static async getObligationById(
    tenant: TenantContext,
    id: string,
  ): Promise<Obligation | null> {
    return tenant.obligations.findById(id);
  }

  /**
   * Updates an obligation, recalculating deadlines and risk levels if dates changed.
   */
  static async updateObligation(
    tenant: TenantContext,
    id: string,
    updates: Partial<CreateObligationRequest>,
    actorId?: string,
  ): Promise<Obligation | null> {
    const existing = await tenant.obligations.findById(id);
    if (!existing) {
      return null;
    }

    const renewalDate = updates.renewalDate ?? existing.renewalDate;
    const noticePeriod = updates.noticePeriodDays ?? existing.noticePeriodDays;
    const amount = updates.amount !== undefined ? updates.amount : Number(existing.amount);

    const cancellationDeadline = calculateCancellationDeadline(renewalDate, noticePeriod);
    const riskLevel = this.calculateRiskLevel(renewalDate, cancellationDeadline, amount);

    const updated = await tenant.obligations.update(id, {
      ...updates,
      amount: updates.amount !== undefined ? String(updates.amount) : undefined,
      cancellationDeadline,
      riskLevel,
      version: existing.version + 1,
    });

    if (updated) {
      await tenant.audit.record('obligation', id, 'updated', {
        actorId,
        beforeState: existing as unknown as Record<string, unknown>,
        afterState: updated as unknown as Record<string, unknown>,
      });
    }

    return updated;
  }

  /**
   * Soft deletes an obligation.
   */
  static async deleteObligation(
    tenant: TenantContext,
    id: string,
    actorId?: string,
  ): Promise<boolean> {
    const deleted = await tenant.obligations.softDelete(id);
    if (deleted) {
      await tenant.audit.record('obligation', id, 'deleted', {
        actorId,
        beforeState: deleted as unknown as Record<string, unknown>,
      });
      return true;
    }
    return false;
  }

  /**
   * Advances an obligation's renewal cycle when renewed.
   */
  static async renewObligation(
    tenant: TenantContext,
    id: string,
    actorId?: string,
  ): Promise<Obligation | null> {
    const existing = await tenant.obligations.findById(id);
    if (!existing) {
      return null;
    }

    const nextRenewalDate = calculateNextRenewalDate(
      existing.renewalDate,
      existing.billingFrequency as BillingFrequency,
    );

    const nextCancellationDeadline = calculateCancellationDeadline(
      nextRenewalDate,
      existing.noticePeriodDays,
    );

    const updated = await tenant.obligations.update(id, {
      renewalDate: nextRenewalDate,
      cancellationDeadline: nextCancellationDeadline,
      status: 'active',
      version: existing.version + 1,
    });

    if (updated) {
      await tenant.audit.record('obligation', id, 'renewed', {
        actorId,
        beforeState: existing as unknown as Record<string, unknown>,
        afterState: updated as unknown as Record<string, unknown>,
      });
    }

    return updated;
  }
}
