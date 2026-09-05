import { eq, and, isNull, ilike, desc, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import * as schema from '../../db/schema/index.js';

export interface ObligationListFilter {
  type?: string;
  status?: string;
  riskLevel?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class ObligationRepository {
  /**
   * Retrieves an obligation by ID strictly scoped to the tenant organization.
   */
  static async findById(organizationId: string, id: string): Promise<schema.Obligation | null> {
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
  }

  /**
   * Lists obligations scoped to the organization with type, status, risk, and search filtering.
   */
  static async list(
    organizationId: string,
    filter: ObligationListFilter = {},
  ): Promise<{ items: schema.Obligation[]; total: number }> {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const conditions = [
      eq(schema.obligations.organizationId, organizationId),
      isNull(schema.obligations.deletedAt),
    ];

    if (filter.type) {
      conditions.push(eq(schema.obligations.type, filter.type));
    }
    if (filter.status) {
      conditions.push(eq(schema.obligations.status, filter.status));
    }
    if (filter.riskLevel) {
      conditions.push(eq(schema.obligations.riskLevel, filter.riskLevel));
    }
    if (filter.search) {
      const sanitized = filter.search.replace(/[%_]/g, '\\$&');
      conditions.push(ilike(schema.obligations.title, `%${sanitized}%`));
    }

    const whereClause = and(...conditions);

    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(schema.obligations)
        .where(whereClause)
        .orderBy(desc(schema.obligations.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.obligations)
        .where(whereClause),
    ]);

    return {
      items,
      total: countResult[0]?.count ?? 0,
    };
  }

  /**
   * Creates a new obligation bound to the organization.
   */
  static async create(
    organizationId: string,
    data: Omit<schema.NewObligation, 'organizationId' | 'id'>,
  ): Promise<schema.Obligation> {
    const [inserted] = await db
      .insert(schema.obligations)
      .values({
        ...data,
        organizationId,
      })
      .returning();

    return inserted;
  }

  /**
   * Updates an existing obligation strictly scoped to the organization.
   */
  static async update(
    organizationId: string,
    id: string,
    data: Partial<Omit<schema.NewObligation, 'id' | 'organizationId'>>,
  ): Promise<schema.Obligation | null> {
    const [updated] = await db
      .update(schema.obligations)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.obligations.id, id),
          eq(schema.obligations.organizationId, organizationId),
          isNull(schema.obligations.deletedAt),
        ),
      )
      .returning();

    return updated ?? null;
  }

  /**
   * Soft deletes an obligation scoped to the organization.
   */
  static async softDelete(organizationId: string, id: string): Promise<schema.Obligation | null> {
    const [deleted] = await db
      .update(schema.obligations)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.obligations.id, id),
          eq(schema.obligations.organizationId, organizationId),
          isNull(schema.obligations.deletedAt),
        ),
      )
      .returning();

    return deleted ?? null;
  }
}
