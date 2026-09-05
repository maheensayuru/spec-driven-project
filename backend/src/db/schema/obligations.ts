import {
  pgTable,
  uuid,
  varchar,
  numeric,
  char,
  date,
  integer,
  boolean,
  jsonb,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const obligations = pgTable(
  'obligations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id'),
    title: varchar('title', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull().default('0.00'),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    billingFrequency: varchar('billing_frequency', { length: 50 }).notNull(),
    startDate: date('start_date'),
    renewalDate: date('renewal_date').notNull(),
    expirationDate: date('expiration_date'),
    noticePeriodDays: integer('notice_period_days').notNull().default(30),
    cancellationDeadline: date('cancellation_deadline').notNull(),
    autoRenew: boolean('auto_renew').notNull().default(true),
    riskLevel: varchar('risk_level', { length: 20 }).notNull().default('low'),
    internalOwnerId: uuid('internal_owner_id').references(() => users.id, { onDelete: 'set null' }),
    tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
    notes: text('notes'),
    version: integer('version').notNull().default(1),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgStatusIdx: index('idx_obligations_org_status').on(table.organizationId, table.status),
    orgCancellationIdx: index('idx_obligations_cancellation').on(
      table.organizationId,
      table.cancellationDeadline,
    ),
    orgRenewalIdx: index('idx_obligations_renewal').on(table.organizationId, table.renewalDate),
  }),
);

export type Obligation = typeof obligations.$inferSelect;
export type NewObligation = typeof obligations.$inferInsert;
