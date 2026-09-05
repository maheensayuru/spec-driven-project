import { describe, it, expect } from 'vitest';
import { IngestionService, StagedExtractionRecord } from '../../../src/modules/ingestion/ingestion.service.js';
import { TenantContext, TenantObligationsContext, TenantAuditContext } from '../../../src/db/connection.js';
import { Obligation } from '../../../src/db/schema/obligations.js';
import { AuditEvent } from '../../../src/db/schema/audit.js';

function createMockTenantContext(organizationId: string): TenantContext {
  const store = new Map<string, Obligation>();
  const auditLogs: AuditEvent[] = [];

  const obligations: TenantObligationsContext = {
    async findById(id: string): Promise<Obligation | null> {
      return store.get(id) ?? null;
    },
    async list(): Promise<Obligation[]> {
      return Array.from(store.values());
    },
    async create(data: Omit<Obligation, 'organizationId' | 'id' | 'createdAt' | 'updatedAt'>): Promise<Obligation> {
      const id = `obl-${Date.now()}`;
      const record = {
        ...data,
        id,
        organizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as Obligation;
      store.set(id, record);
      return record;
    },
    async update(id: string, data: Partial<Omit<Obligation, 'id' | 'organizationId'>>): Promise<Obligation | null> {
      const existing = store.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...data, updatedAt: new Date() } as Obligation;
      store.set(id, updated);
      return updated;
    },
    async softDelete(id: string): Promise<Obligation | null> {
      const existing = store.get(id);
      if (!existing) return null;
      const deleted = { ...existing, deletedAt: new Date() };
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

describe('Document Extraction & Human Verification Workflow (User Story 5)', () => {
  const orgId = '77777777-7777-7777-7777-777777777777';
  const tenant = createMockTenantContext(orgId);

  it('stages extraction as pending_review, then promotes to active obligation upon human confirmation', async () => {
    // 1. Stage raw extraction
    const staging: StagedExtractionRecord = {
      stagingId: 'stage-1',
      documentId: 'doc-1',
      organizationId: orgId,
      status: 'pending_review',
      overallConfidence: 0.88,
      fields: [
        { fieldName: 'title', extractedValue: 'GitHub Enterprise Subscription', confidence: 0.96, requiresReview: false },
        { fieldName: 'amount', extractedValue: 2500, confidence: 0.92, requiresReview: false },
        { fieldName: 'renewalDate', extractedValue: '2026-12-01', confidence: 0.90, requiresReview: false },
        { fieldName: 'noticePeriodDays', extractedValue: 30, confidence: 0.75, requiresReview: true }, // review flagged
      ],
      suggestedType: 'subscription',
      suggestedVendor: 'GitHub, Inc.',
      suggestedAmount: 2500,
      suggestedRenewalDate: '2026-12-01',
      suggestedNoticePeriodDays: 30,
    };

    IngestionService.registerStagingMock(staging);

    // 2. Fetch staged review detail
    const retrieved = await IngestionService.getStagedExtraction(orgId, 'stage-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.status).toBe('pending_review');
    expect(retrieved?.fields.find((f) => f.fieldName === 'noticePeriodDays')?.requiresReview).toBe(true);

    // 3. User reviews and corrects the amount from 2500 to 2600 and confirms
    const confirmedObligation = await IngestionService.confirmExtraction(
      tenant,
      'stage-1',
      {
        title: 'GitHub Enterprise Cloud',
        type: 'subscription',
        vendorName: 'GitHub, Inc.',
        amount: 2600, // User corrected value
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-12-01',
        noticePeriodDays: 30,
        autoRenew: true,
        notes: 'Confirmed from invoice #INV-2026-09',
      },
      'user-reviewer-1',
    );

    expect(confirmedObligation).toBeDefined();
    expect(confirmedObligation.status).toBe('active');
    expect(confirmedObligation.amount).toBe('2600');
    expect(confirmedObligation.cancellationDeadline).toBe('2026-11-01');

    // 4. Verify staging status updated to confirmed
    const afterConfirm = await IngestionService.getStagedExtraction(orgId, 'stage-1');
    expect(afterConfirm?.status).toBe('confirmed');
  });
});
