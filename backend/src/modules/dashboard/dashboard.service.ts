import { DashboardMetricsResponse, UrgentActionItem } from '@renewalradar/shared';
import { TenantContext } from '../../db/connection.js';
import { Obligation } from '../../db/schema/obligations.js';

export class DashboardService {
  /**
   * Normalizes any billing frequency into annualized spend.
   */
  static annualizeSpend(amount: number, frequency: string): number {
    switch (frequency) {
      case 'monthly':
        return amount * 12;
      case 'quarterly':
        return amount * 4;
      case 'annual':
        return amount;
      case 'biennial':
        return amount / 2;
      case 'one_time':
        return amount;
      default:
        return amount;
    }
  }

  /**
   * Aggregates executive dashboard metrics for an organization answering
   * "What do I need to know or do today?" (FR-021 & SC-006).
   */
  static async aggregateDashboard(
    tenant: TenantContext,
    reportingCurrency = 'USD',
  ): Promise<DashboardMetricsResponse> {
    const obligations = await tenant.obligations.list(500, 0);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let totalAnnualCommittedSpend = 0;
    let imminentNoticeCount = 0;
    let imminentRenewalCount = 0;

    const spendByCurrency: Record<string, number> = {};
    const spendByType: Record<string, number> = {};
    const urgentActions: UrgentActionItem[] = [];

    for (const obl of obligations) {
      const amount = Number(obl.amount);
      const annualized = this.annualizeSpend(amount, obl.billingFrequency);

      totalAnnualCommittedSpend += annualized;

      // Currency breakdown
      spendByCurrency[obl.currency] = (spendByCurrency[obl.currency] ?? 0) + annualized;

      // Type breakdown
      spendByType[obl.type] = (spendByType[obl.type] ?? 0) + annualized;

      // Notice deadline days remaining
      const cancelDate = new Date(obl.cancellationDeadline + 'T00:00:00Z');
      const daysToNotice = Math.ceil(
        (cancelDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Renewal days remaining
      const renewDate = new Date(obl.renewalDate + 'T00:00:00Z');
      const daysToRenewal = Math.ceil(
        (renewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysToNotice <= 30 && daysToNotice >= 0) {
        imminentNoticeCount++;
      }

      if (daysToRenewal <= 30 && daysToRenewal >= 0) {
        imminentRenewalCount++;
      }

      // Populate urgent actions if notice is <= 30 days or risk is critical/high
      if (daysToNotice <= 30 || obl.riskLevel === 'critical' || obl.riskLevel === 'high') {
        urgentActions.push({
          id: `act-${obl.id}`,
          obligationId: obl.id,
          title: obl.title,
          vendor: undefined,
          actionType: daysToNotice <= 14 ? 'notice_deadline_approaching' : 'renewal_approaching',
          dueDate: obl.cancellationDeadline,
          daysRemaining: daysToNotice,
          riskLevel: obl.riskLevel as 'critical' | 'high' | 'medium' | 'low',
          amount,
          currency: obl.currency,
        });
      }
    }

    // Sort urgent actions by urgency (fewest days remaining first)
    urgentActions.sort((a, b) => a.daysRemaining - b.daysRemaining);
    return {
      totalActiveObligations: obligations.length,
      totalAnnualCommittedSpend: Math.round(totalAnnualCommittedSpend * 100) / 100,
      reportingCurrency,
      imminentNoticeDeadlinesCount: imminentNoticeCount,
      imminentRenewalsCount: imminentRenewalCount,
      pendingVerificationDocumentsCount: 0,
      urgentActions,
      upcomingRenewalsTimeline: obligations.slice(0, 10).map((o) => ({
        id: o.id,
        organizationId: o.organizationId,
        vendorId: o.vendorId,
        title: o.title,
        type: o.type as
          | 'contract'
          | 'subscription'
          | 'license'
          | 'permit'
          | 'insurance'
          | 'warranty'
          | 'vendor_agreement'
          | 'lease'
          | 'other',
        status: o.status as
          | 'draft'
          | 'active'
          | 'under_review'
          | 'notice_given'
          | 'renewed'
          | 'expired'
          | 'terminated'
          | 'archived',
        amount: Number(o.amount),
        currency: o.currency,
        billingFrequency: o.billingFrequency as
          'monthly' | 'quarterly' | 'annual' | 'biennial' | 'one_time',
        startDate: o.startDate ?? undefined,
        renewalDate: o.renewalDate,
        expirationDate: o.expirationDate ?? undefined,
        noticePeriodDays: o.noticePeriodDays,
        cancellationDeadline: o.cancellationDeadline,
        autoRenew: o.autoRenew,
        riskLevel: o.riskLevel as 'critical' | 'high' | 'medium' | 'low',
        internalOwnerId: o.internalOwnerId ?? undefined,
        tags: (o.tags as string[]) ?? [],
        notes: o.notes ?? undefined,
        version: o.version,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),
      spendByCurrencyBreakdown: spendByCurrency,
      spendByTypeBreakdown: spendByType,
    };
  }
}
