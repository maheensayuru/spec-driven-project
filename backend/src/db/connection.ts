import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';
import { eq, and, isNull } from 'drizzle-orm';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

export interface AuditRecordOptions {
  actorId?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

export interface TenantObligationsContext {
  findById(id: string): Promise<schema.Obligation | null>;
  list(limit?: number, offset?: number): Promise<schema.Obligation[]>;
  create(data: Omit<schema.NewObligation, 'organizationId'>): Promise<schema.Obligation>;
  update(
    id: string,
    data: Partial<Omit<schema.NewObligation, 'id' | 'organizationId'>>,
  ): Promise<schema.Obligation | null>;
  softDelete(id: string): Promise<schema.Obligation | null>;
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
    async findById(id: string): Promise<schema.Obligation | null> {
      const rows = await db
        .select()
        .from(schema.obligations)
        .where(
          and(
            eq(schema.obligations.id, id),
            eq(schema.obligations.organizationId, organizationId),
            isNull(schema.obligations.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async list(limit = 50, offset = 0): Promise<schema.Obligation[]> {
      return db
        .select()
        .from(schema.obligations)
        .where(
          and(
            eq(schema.obligations.organizationId, organizationId),
            isNull(schema.obligations.deletedAt),
          ),
        )
        .limit(limit)
        .offset(offset);
    },

    async create(data: Omit<schema.NewObligation, 'organizationId'>): Promise<schema.Obligation> {
      const [inserted] = await db
        .insert(schema.obligations)
        .values({ ...data, organizationId })
        .returning();
      return inserted;
    },

    async update(
      id: string,
      data: Partial<Omit<schema.NewObligation, 'id' | 'organizationId'>>,
    ): Promise<schema.Obligation | null> {
      const [updated] = await db
        .update(schema.obligations)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(schema.obligations.id, id),
            eq(schema.obligations.organizationId, organizationId),
            isNull(schema.obligations.deletedAt),
          ),
        )
        .returning();
      return updated ?? null;
    },

    async softDelete(id: string): Promise<schema.Obligation | null> {
      const [deleted] = await db
        .update(schema.obligations)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(schema.obligations.id, id),
            eq(schema.obligations.organizationId, organizationId),
            isNull(schema.obligations.deletedAt),
          ),
        )
        .returning();
      return deleted ?? null;
    },
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
