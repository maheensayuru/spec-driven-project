import { describe, it, expect } from 'vitest';
import { ObligationService } from '../../../src/modules/obligations/obligation.service.js';
import { TenantContext, TenantObligationsContext, TenantAuditContext } from '../../../src/db/connection.js';
import { Obligation } from '../../../src/db/schema/obligations.js';
import { AuditEvent } from '../../../src/db/schema/audit.js';

// In-Memory Tenant Mock implementing TenantContext for fast, hermetic integration tests
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

    async create(data: Omit<Obligation, 'organizationId' | 'id' | 'createdAt' | 'updatedAt'>): Promise<Obligation> {
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

    async update(id: string, data: Partial<Omit<Obligation, 'id' | 'organizationId'>>): Promise<Obligation | null> {
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

describe('Obligation Lifecycle Integration Tests (User Story 1)', () => {
  const orgId = '11111111-2222-3333-4444-555555555555';
  const tenant = createMockTenantContext(orgId);

  it('progresses through creation, update, renewal cycle, and soft deletion', async () => {
    // 1. Create Obligation
    const created = await ObligationService.createObligation(
      tenant,
      {
        title: 'Salesforce Enterprise CRM',
        type: 'subscription',
        amount: 15000,
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-12-31',
        noticePeriodDays: 60,
        autoRenew: true,
        tags: ['crm', 'sales'],
      },
      'user-1',
    );

    expect(created.id).toBeDefined();
    expect(created.status).toBe('active');
    expect(created.cancellationDeadline).toBe('2026-11-01');
    expect(created.riskLevel).toBe('low'); // renewal is > 60 days away

    // 2. Fetch by ID
    const fetched = await ObligationService.getObligationById(tenant, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Salesforce Enterprise CRM');

    // 3. Update Title and Notice Period
    const updated = await ObligationService.updateObligation(
      tenant,
      created.id,
      {
        title: 'Salesforce Unlimited CRM',
        noticePeriodDays: 30,
      },
      'user-1',
    );
    expect(updated).not.toBeNull();
    expect(updated?.title).toBe('Salesforce Unlimited CRM');
    expect(updated?.cancellationDeadline).toBe('2026-12-01'); // 2026-12-31 - 30 days
    expect(updated?.version).toBe(2);

    // 4. Renew Obligation (Annual Cycle Advance)
    const renewed = await ObligationService.renewObligation(tenant, created.id, 'user-1');
    expect(renewed).not.toBeNull();
    expect(renewed?.renewalDate).toBe('2027-12-31');
    expect(renewed?.cancellationDeadline).toBe('2027-12-01');
    expect(renewed?.version).toBe(3);

    // 5. Soft Delete
    const deleted = await ObligationService.deleteObligation(tenant, created.id, 'user-1');
    expect(deleted).toBe(true);

    // 6. Verify Excluded from queries
    const afterDelete = await ObligationService.getObligationById(tenant, created.id);
    expect(afterDelete).toBeNull();
  });
});
