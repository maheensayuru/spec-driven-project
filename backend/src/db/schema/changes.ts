import { pgTable, uuid, numeric, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { obligations } from './obligations.js';
import { documents } from './documents.js';

export const contractChangeDiffs = pgTable('contract_change_diffs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  obligationId: uuid('obligation_id')
    .notNull()
    .references(() => obligations.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  previousState: jsonb('previous_state').notNull(),
  newState: jsonb('new_state').notNull(),
  priceDelta: numeric('price_delta', { precision: 15, scale: 2 }).notNull().default('0.00'),
  pricePercentChange: numeric('price_percent_change', { precision: 6, scale: 2 }).notNull().default('0.00'),
  warnings: jsonb('warnings').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ContractChangeDiff = typeof contractChangeDiffs.$inferSelect;
export type NewContractChangeDiff = typeof contractChangeDiffs.$inferInsert;
