import { eq, and, isNull, ilike, desc, sql, or, gte, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';

export type ObligationWithVendor = schema.Obligation & { vendorName?: string };

export interface ObligationListFilter {
  type?: string;
  status?: string;
  riskLevel?: string;
  search?: string;
  upcomingDays?: number;
  limit?: number;
  offset?: number;
}

export class ObligationRepository {
  /**
   * Retrieves an obligation by ID strictly scoped to the tenant organization.
   */
  static async findById(
    organizationId: string,
    id: string,
  ): Promise<ObligationWithVendor | null> {
    const rows = await db
      .select({
        obligation: schema.obligations,
        vendorName: schema.vendors.name,
      })
      .from(schema.obligations)
      .leftJoin(
        schema.vendors,
        and(
          eq(schema.obligations.vendorId, schema.vendors.id),
          eq(schema.vendors.organizationId, organizationId),
        ),
      )
      .where(
        and(
          eq(schema.obligations.id, id),
          eq(schema.obligations.organizationId, organizationId),
          isNull(schema.obligations.deletedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? this.withVendorName(row.obligation, row.vendorName) : null;
  }

  /**
   * Lists obligations scoped to the organization with type, status, risk, and search filtering.
   */
  static async list(
    organizationId: string,
    filter: ObligationListFilter = {},
  ): Promise<{ items: ObligationWithVendor[]; total: number }> {
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
      const sanitized = filter.search.replace(/[%_\\]/g, '\\$&');
      const pattern = `%${sanitized}%`;
      conditions.push(
        or(
          ilike(schema.obligations.title, pattern),
          ilike(schema.vendors.name, pattern),
          sql`${schema.obligations.tags}::text ILIKE ${pattern} ESCAPE '\\'`,
        )!,
      );
    }
    if (filter.upcomingDays) {
      conditions.push(
        gte(schema.obligations.cancellationDeadline, sql`CURRENT_DATE`),
        lte(
          schema.obligations.cancellationDeadline,
          sql`CURRENT_DATE + ${filter.upcomingDays} * INTERVAL '1 day'`,
        ),
      );
    }

    const whereClause = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db
        .select({
          obligation: schema.obligations,
          vendorName: schema.vendors.name,
        })
        .from(schema.obligations)
        .leftJoin(
          schema.vendors,
          and(
            eq(schema.obligations.vendorId, schema.vendors.id),
            eq(schema.vendors.organizationId, organizationId),
          ),
        )
        .where(whereClause)
        .orderBy(desc(schema.obligations.createdAt), desc(schema.obligations.id))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.obligations)
        .leftJoin(
          schema.vendors,
          and(
            eq(schema.obligations.vendorId, schema.vendors.id),
            eq(schema.vendors.organizationId, organizationId),
          ),
        )
        .where(whereClause),
    ]);

    return {
      items: rows.map((row) => this.withVendorName(row.obligation, row.vendorName)),
      total: countResult[0]?.count ?? 0,
    };
  }

  /**
   * Resolves a vendor name only within the organization, creating it when necessary.
   */
  static async findOrCreateVendor(organizationId: string, name: string): Promise<schema.Vendor> {
    const normalizedName = name.trim();
    const [existing] = await db
      .select()
      .from(schema.vendors)
      .where(
        and(
          eq(schema.vendors.organizationId, organizationId),
          sql`lower(${schema.vendors.name}) = lower(${normalizedName})`,
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await db
      .insert(schema.vendors)
      .values({ organizationId, name: normalizedName })
      .returning();
    return created;
  }

  private static withVendorName(
    obligation: schema.Obligation,
    vendorName: string | null,
  ): ObligationWithVendor {
    return vendorName ? { ...obligation, vendorName } : obligation;
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
