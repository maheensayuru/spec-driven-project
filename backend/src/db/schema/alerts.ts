import {
  pgTable,
  uuid,
  varchar,
  date,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { obligations } from './obligations.js';
import { users } from './users.js';

export const obligationAlerts = pgTable(
  'obligation_alerts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    obligationId: uuid('obligation_id')
      .notNull()
      .references(() => obligations.id, { onDelete: 'cascade' }),
    milestone: varchar('milestone', { length: 50 }).notNull(), // '90_day' | '60_day' | '30_day' | '14_day' | '7_day' | '1_day' | 'overdue'
    triggerDate: date('trigger_date').notNull(),
    priority: varchar('priority', { length: 20 }).notNull().default('medium'), // 'critical' | 'high' | 'medium' | 'low'
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(), // {org_id}:{obligation_id}:{milestone}:{trigger_date}
    inAppDelivered: boolean('in_app_delivered').notNull().default(false),
    emailDelivered: boolean('email_delivered').notNull().default(false),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueIdempotencyIdx: uniqueIndex('idx_alerts_idempotency_key').on(table.idempotencyKey),
    orgTriggerIdx: index('idx_alerts_org_trigger').on(table.organizationId, table.triggerDate),
  }),
);

export type ObligationAlert = typeof obligationAlerts.$inferSelect;
export type NewObligationAlert = typeof obligationAlerts.$inferInsert;
