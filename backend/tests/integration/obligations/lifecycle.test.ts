import { describe, it, expect } from 'vitest';
import { ObligationService } from '../../../src/modules/obligations/obligation.service.js';
import {
  TenantContext,
  TenantObligationsContext,
  TenantAuditContext,
} from '../../../src/db/connection.js';
import { Obligation } from '../../../src/db/schema/obligations.js';
import { AuditEvent } from '../../../src/db/schema/audit.js';

function createMockTenantContext(organizationId: string): TenantContext {
  const store = new Map<string, Obligation>();
  const auditLogs: AuditEvent[] = [];

  const obligations: TenantObligationsContext = {
    async findById(id: string): Promise<Obligation | null> {
      const item = store.get(id);
      if (!item || item.organizationId !== organizationId || item.deletedAt) {
        return null;
      }
      return item;
    },

    async list(limit = 50, offset = 0): Promise<Obligation[]> {
      const items = Array.from(store.values())
        .filter((i) => i.organizationId === organizationId && !i.deletedAt)
        .slice(offset, offset + limit);
      return items;
    },

    async create(
      data: Omit<Obligation, 'organizationId' | 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<Obligation> {
      const id = `mock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date();
      const record: Obligation = {
        ...data,
        id,
        organizationId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      } as Obligation;
      store.set(id, record);
      return record;
    },

    async update(
      id: string,
      data: Partial<Omit<Obligation, 'id' | 'organizationId'>>,
    ): Promise<Obligation | null> {
      const existing = store.get(id);
      if (!existing || existing.organizationId !== organizationId || existing.deletedAt) {
        return null;
      }
      const updated: Obligation = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      } as Obligation;
      store.set(id, updated);
      return updated;
    },

    async softDelete(id: string): Promise<Obligation | null> {
      const existing = store.get(id);
      if (!existing || existing.organizationId !== organizationId || existing.deletedAt) {
        return null;
      }
      const deleted: Obligation = {
        ...existing,
        deletedAt: new Date(),
      };
      store.set(id, deleted);
      return deleted;
    },
  };

  const audit: TenantAuditContext = {
    async record(
      entityType: string,
      entityId: string,
      action: string,
      details?: {
        actorId?: string;
        beforeState?: Record<string, unknown> | null;
        afterState?: Record<string, unknown> | null;
        ipAddress?: string;
        userAgent?: string;
      },
    ): Promise<AuditEvent> {
      const event: AuditEvent = {
        id: `audit-${Date.now()}`,
        organizationId,
        actorId: details?.actorId ?? null,
        entityType,
        entityId,
        action,
        beforeState: details?.beforeState ?? null,
        afterState: details?.afterState ?? null,
        ipAddress: details?.ipAddress ?? null,
        userAgent: details?.userAgent ?? null,
        createdAt: new Date(),
      };
      auditLogs.push(event);
      return event;
    },
  };

  return {
    organizationId,
    obligations,
    audit,
  };
}

describe('Obligation Lifecycle Integration Tests (User Story 1 & Task T015)', () => {
  const orgId = '11111111-2222-3333-4444-555555555555';
  const tenant = createMockTenantContext(orgId);

  it('verifies valid lifecycle progression: Draft -> Active -> Renewed -> Archived', async () => {
    // 1. Create as Draft
    const draft = await ObligationService.createObligation(
      tenant,
      {
        title: 'Draft Vendor Contract',
        type: 'contract',
        status: 'draft',
        amount: 5000,
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-12-31',
        noticePeriodDays: 30,
        autoRenew: true,
      },
      'user-1',
    );

    // Explicitly transition Draft -> Active
    const activated = await ObligationService.transitionStatus(
      tenant,
      draft.id,
      'active',
      'user-1',
    );
    expect(activated.status).toBe('active');

    // Active -> Renewed (advances renewal cycle)
    const renewed = await ObligationService.renewObligation(tenant, draft.id, 'user-1');
    expect(renewed).not.toBeNull();
    expect(renewed?.renewalDate).toBe('2027-12-31');
    expect(renewed?.version).toBe(3);

    // Renewed -> Archived
    const archived = await ObligationService.transitionStatus(
      tenant,
      draft.id,
      'archived',
      'user-1',
    );
    expect(archived.status).toBe('archived');
  });

  it('rejects invalid lifecycle transitions', async () => {
    // 1. Create Active obligation
    const active = await ObligationService.createObligation(
      tenant,
      {
        title: 'Active Subscription',
        type: 'subscription',
        amount: 1000,
        currency: 'USD',
        billingFrequency: 'monthly',
        renewalDate: '2026-10-15',
        noticePeriodDays: 14,
        autoRenew: true,
      },
      'user-1',
    );

    // Cannot transition Active -> Draft
    await expect(
      ObligationService.transitionStatus(tenant, active.id, 'draft', 'user-1'),
    ).rejects.toThrowError("Invalid status transition from 'active' to 'draft'");

    // Archive it
    await ObligationService.transitionStatus(tenant, active.id, 'archived', 'user-1');

    // Cannot transition Archived -> Active (Archived is terminal)
    await expect(
      ObligationService.transitionStatus(tenant, active.id, 'active', 'user-1'),
    ).rejects.toThrowError("Invalid status transition from 'archived' to 'active'");

    // Cannot transition Archived -> Renewed
    await expect(
      ObligationService.transitionStatus(tenant, active.id, 'renewed', 'user-1'),
    ).rejects.toThrowError("Invalid status transition from 'archived' to 'renewed'");
  });
});
