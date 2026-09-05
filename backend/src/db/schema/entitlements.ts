import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';

export const subscriptionEntitlements = pgTable('subscription_entitlements', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  tier: varchar('tier', { length: 50 }).notNull().default('free'), // 'free' | 'business' | 'pro'
  maxObligations: integer('max_obligations').notNull().default(10),
  monthlyAiExtractions: integer('monthly_ai_extractions').notNull().default(0),
  currentAiExtractionsUsed: integer('current_ai_extractions_used').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SubscriptionEntitlement = typeof subscriptionEntitlements.$inferSelect;
export type NewSubscriptionEntitlement = typeof subscriptionEntitlements.$inferInsert;
