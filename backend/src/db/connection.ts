import { db } from './client.js';
import * as schema from './schema/index.js';
import { ObligationRepository, type ObligationListFilter, type ObligationWithVendor } from '../modules/obligations/obligation.repository.js';

export { db, databaseBackend, closeDatabase } from './client.js';

export interface AuditRecordOptions {
  actorId?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

export interface TenantObligationsContext {
  findById(id: string): Promise<ObligationWithVendor | null>;
  list(filter?: ObligationListFilter): Promise<{ items: ObligationWithVendor[]; total: number }>;
  findOrCreateVendor(name: string): Promise<schema.Vendor>;
  create(data: Omit<schema.NewObligation, 'organizationId'>): Promise<ObligationWithVendor>;
  update(id: string, data: Partial<Omit<schema.NewObligation, 'id' | 'organizationId'>>): Promise<ObligationWithVendor | null>;
  softDelete(id: string): Promise<ObligationWithVendor | null>;
}

export interface TenantAuditContext {
  record(
    entityType: string,
    entityId: string,
    action: string,
    details?: AuditRecordOptions,
  ): Promise<schema.AuditEvent>;
}

export interface TenantContext {
  readonly organizationId: string;
  readonly obligations: TenantObligationsContext;
  readonly audit: TenantAuditContext;
}

/**
 * Tenant-scoped query helper ensuring that all queries are bound
 * to a specific organization_id to enforce multi-tenant isolation by construction.
 */
export function createTenantContext(organizationId: string): TenantContext {
  if (!organizationId) {
    throw new Error('Tenant context requires a valid organizationId');
  }

  const obligations: TenantObligationsContext = {
    findById: (id) => ObligationRepository.findById(organizationId, id),
    list: (filter) => ObligationRepository.list(organizationId, filter),
    findOrCreateVendor: (name) => ObligationRepository.findOrCreateVendor(organizationId, name),
    create: (data) => ObligationRepository.create(organizationId, data),
    update: (id, data) => ObligationRepository.update(organizationId, id, data),
    softDelete: (id) => ObligationRepository.softDelete(organizationId, id),
  };

  const audit: TenantAuditContext = {
    async record(
      entityType: string,
      entityId: string,
      action: string,
      details?: AuditRecordOptions,
    ): Promise<schema.AuditEvent> {
      const [event] = await db
        .insert(schema.auditEvents)
        .values({
          organizationId,
          actorId: details?.actorId,
          entityType,
          entityId,
          action,
          beforeState: details?.beforeState,
          afterState: details?.afterState,
          ipAddress: details?.ipAddress,
          userAgent: details?.userAgent,
        })
        .returning();
      return event;
    },
  };

  return {
    organizationId,
    obligations,
    audit,
  };
}
