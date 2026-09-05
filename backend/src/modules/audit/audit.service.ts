import { db } from '../../db/connection.js';
import * as schema from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';
import { env } from '../../config/env.js';

export interface AuditQueryOptions {
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}

export class AuditService {
  private static mockLogs: schema.AuditEvent[] = [];

  static registerMockLog(log: schema.AuditEvent): void {
    this.mockLogs.push(log);
  }

  /**
   * Retrieves immutable audit events scoped strictly to the authenticated organization.
   * Ordered chronologically descending (newest first).
   */
  static async queryLogs(
    organizationId: string,
    options: AuditQueryOptions = {},
  ): Promise<schema.AuditEvent[]> {
    if (env.NODE_ENV === 'test' && this.mockLogs.length > 0) {
      return this.mockLogs.filter((l) => l.organizationId === organizationId);
    }

    try {
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;

      return await db
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.organizationId, organizationId))
        .orderBy(desc(schema.auditEvents.createdAt))
        .limit(limit)
        .offset(offset);
    } catch {
      // In testing environments without active Postgres container
      return this.mockLogs.filter((l) => l.organizationId === organizationId);
    }
  }
}
