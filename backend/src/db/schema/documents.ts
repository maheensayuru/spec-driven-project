import {
  pgTable,
  uuid,
  varchar,
  bigint,
  char,
  real,
  jsonb,
  timestamp,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { obligations } from './obligations.js';
import { users } from './users.js';

export const documents = pgTable(
  'documents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    obligationId: uuid('obligation_id').references(() => obligations.id, { onDelete: 'set null' }),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    sanitizedFilename: varchar('sanitized_filename', { length: 255 }).notNull(),
    declaredMimeType: varchar('declared_mime_type', { length: 100 }).notNull(),
    detectedMimeType: varchar('detected_mime_type', { length: 100 }),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
    fileHashSha256: char('file_hash_sha256', { length: 64 }),
    storagePath: varchar('storage_path', { length: 512 }).notNull(),
    processingStatus: varchar('processing_status', { length: 50 })
      .notNull()
      .default('upload_pending'),
    securityStatus: varchar('security_status', { length: 50 }).notNull().default('scan_pending'),
    failureReason: text('failure_reason'),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    extractionStartedAt: timestamp('extraction_started_at', { withTimezone: true }),
    extractionCompletedAt: timestamp('extraction_completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgProcessingStatusIdx: index('idx_documents_org_processing_status').on(
      table.organizationId,
      table.processingStatus,
    ),
    orgSecurityStatusIdx: index('idx_documents_org_security_status').on(
      table.organizationId,
      table.securityStatus,
    ),
    orgCreatedAtIdx: index('idx_documents_org_created_at').on(
      table.organizationId,
      table.createdAt,
    ),
    obligationIdx: index('idx_documents_obligation_id').on(table.obligationId),
  }),
);

export const extractionStagings = pgTable(
  'extraction_stagings',
  {
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
    provider: varchar('provider', { length: 50 }),
    providerModel: varchar('provider_model', { length: 255 }),
    providerMetadata: jsonb('provider_metadata'),
    failureReason: text('failure_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentIdx: uniqueIndex('idx_extraction_stagings_document_id').on(table.documentId),
    orgStatusIdx: index('idx_extraction_stagings_org_status').on(
      table.organizationId,
      table.status,
    ),
    orgCreatedAtIdx: index('idx_extraction_stagings_org_created_at').on(
      table.organizationId,
      table.createdAt,
    ),
  }),
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type ExtractionStaging = typeof extractionStagings.$inferSelect;
export type NewExtractionStaging = typeof extractionStagings.$inferInsert;
