import { pgTable, uuid, varchar, bigint, char, real, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { obligations } from './obligations.js';
import { users } from './users.js';

export const documents = pgTable('documents', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  obligationId: uuid('obligation_id').references(() => obligations.id, { onDelete: 'set null' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
  fileHashSha256: char('file_hash_sha256', { length: 64 }).notNull(),
  storagePath: varchar('storage_path', { length: 512 }).notNull(),
  processingStatus: varchar('processing_status', { length: 50 }).notNull().default('uploaded'),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const extractionStagings = pgTable('extraction_stagings', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull().default('pending_review'),
  overallConfidence: real('overall_confidence').notNull().default(0.0),
  extractedFields: jsonb('extracted_fields').notNull(),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type ExtractionStaging = typeof extractionStagings.$inferSelect;
export type NewExtractionStaging = typeof extractionStagings.$inferInsert;
