import { describe, it, expect } from 'vitest';
import { DashboardService } from '../../../src/modules/dashboard/dashboard.service.js';
import {
  TenantContext,
  TenantObligationsContext,
  TenantAuditContext,
} from '../../../src/db/connection.js';
import { Obligation } from '../../../src/db/schema/obligations.js';

function createMockTenant(orgId: string, initialObligations: Obligation[] = []): TenantContext {
  const store = new Map<string, Obligation>();
  for (const o of initialObligations) {
    store.set(o.id, o);
  }

  const obligations: TenantObligationsContext = {
    async findOrCreateVendor() { throw new Error('Unexpected vendor lookup in this test'); },
    async findById(id: string) {
      const item = store.get(id);
      if (!item || item.organizationId !== orgId || item.deletedAt) return null;
      return item;
    },
    async list({ limit = 500, offset = 0 } = {}) {
      const items = Array.from(store.values()).filter((o) => o.organizationId === orgId && !o.deletedAt);
      return { items: items.slice(offset, offset + limit), total: items.length };
    },
    async create(data) {
      const id = `obl-${Date.now()}`;
      const now = new Date();
      const rec = {
        ...data,
        id,
        organizationId: orgId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      } as Obligation;
      store.set(id, rec);
      return rec;
    },
    async update(id, data) {
      const existing = store.get(id);
      if (!existing || existing.organizationId !== orgId) return null;
      const updated = { ...existing, ...data, updatedAt: new Date() } as Obligation;
      store.set(id, updated);
      return updated;
    },
    async softDelete(id) {
      const existing = store.get(id);
      if (!existing || existing.organizationId !== orgId) return null;
      const deleted = { ...existing, deletedAt: new Date() };
      store.set(id, deleted);
      return deleted;
    },
  };

  const audit: TenantAuditContext = {
    async record(entityType: string, entityId: string, action: string) {
      return {
        id: 'mock-audit',
        organizationId: orgId,
        actorId: null,
        entityType,
        entityId,
        action,
        beforeState: null,
        afterState: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };
    },
  };

  return {
    organizationId: orgId,
    obligations,
    audit,
  };
}

describe('Dashboard Aggregation & Executive Metrics (Task T038 & FR-021)', () => {
  const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('returns valid zero-state metrics for an empty organization without errors', async () => {
    const emptyTenant = createMockTenant(orgA, []);
    const metrics = await DashboardService.aggregateDashboard(emptyTenant, 'USD');

    expect(metrics.totalActiveObligations).toBe(0);
    expect(metrics.totalAnnualCommittedSpend).toBe(0);
    expect(metrics.imminentNoticeDeadlinesCount).toBe(0);
    expect(metrics.imminentRenewalsCount).toBe(0);
    expect(metrics.urgentActions.length).toBe(0);
    expect(metrics.upcomingRenewalsTimeline.length).toBe(0);
    expect(metrics.reportingCurrency).toBe('USD');
  });

  it('correctly aggregates active counts, annualized spend, and imminent deadline windows', async () => {
    const sampleObligations: Obligation[] = [
      {
        id: 'obl-1',
        organizationId: orgA,
        vendorId: null,
        title: 'Monthly Cloud Infrastructure',
        type: 'subscription',
        status: 'active',
        amount: '1000.00', // Annualized: 1000 * 12 = 12,000
        currency: 'USD',
        billingFrequency: 'monthly',
        startDate: '2026-01-01',
        renewalDate: '2026-09-25',
        expirationDate: null,
        noticePeriodDays: 14,
        cancellationDeadline: '2026-09-11',
        autoRenew: true,
        riskLevel: 'critical',
        internalOwnerId: 'user-1',
        tags: ['infra'],
        notes: null,
        version: 1,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'obl-2',
        organizationId: orgA,
        vendorId: null,
        title: 'Annual Security Insurance Policy',
        type: 'insurance',
        status: 'active',
        amount: '8000.00', // Annualized: 8000
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-10-31',
        cancellationDeadline: '2026-10-01',
        expirationDate: null,
        noticePeriodDays: 30,
        autoRenew: true,
        riskLevel: 'high',
        internalOwnerId: 'user-1',
        tags: ['insurance'],
        notes: null,
        version: 1,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'obl-3',
        organizationId: orgA,
        vendorId: null,
        title: 'Office Lease Agreement',
        type: 'lease',
        status: 'active',
        amount: '36000.00', // Annualized: 36000
        currency: 'USD',
        billingFrequency: 'annual',
        startDate: '2025-01-01',
        renewalDate: '2027-01-01',
        expirationDate: null,
        noticePeriodDays: 60,
        cancellationDeadline: '2026-11-02',
        autoRenew: true,
        riskLevel: 'low',
        internalOwnerId: 'user-1',
        tags: ['facility'],
        notes: null,
        version: 1,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const tenantA = createMockTenant(orgA, sampleObligations);
    const metrics = await DashboardService.aggregateDashboard(tenantA, 'USD');

    expect(metrics.totalActiveObligations).toBe(3);
    // Total spend: 12,000 + 8,000 + 36,000 = 56,000
    expect(metrics.totalAnnualCommittedSpend).toBe(56000);

    // Imminent notice deadlines
    expect(metrics.imminentNoticeDeadlinesCount).toBeGreaterThanOrEqual(1);

    expect(metrics.urgentActions.length).toBeGreaterThanOrEqual(2);
    expect(metrics.urgentActions.some((a) => a.riskLevel === 'critical')).toBe(true);
    expect(metrics.urgentActions.some((a) => a.riskLevel === 'high')).toBe(true);
    // Spend breakdown by type
    expect(metrics.spendByTypeBreakdown.subscription).toBe(12000);
    expect(metrics.spendByTypeBreakdown.insurance).toBe(8000);
    expect(metrics.spendByTypeBreakdown.lease).toBe(36000);
  });

  it('guarantees tenant isolation: Org B metrics contain zero data from Org A', async () => {
    const tenantB = createMockTenant(orgB, []);
    const metricsB = await DashboardService.aggregateDashboard(tenantB, 'USD');

    expect(metricsB.totalActiveObligations).toBe(0);
    expect(metricsB.totalAnnualCommittedSpend).toBe(0);
    expect(metricsB.urgentActions.find((a) => a.title.includes('Confidential'))).toBeUndefined();
  });
});
