import { z } from 'zod';
import { ObligationTypeSchema, BillingFrequencySchema } from './obligations.contract.js';

export const SupportedDocumentMimeTypeSchema = z.enum([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
]);
export type SupportedDocumentMimeType = z.infer<typeof SupportedDocumentMimeTypeSchema>;

export const DocumentProcessingStatusSchema = z.enum([
  'upload_pending',
  'uploaded',
  'scan_pending',
  'clean',
  'blocked',
  'processing',
  'pending_review',
  'confirmed',
  'rejected',
  'extraction_failed',
]);
export type DocumentProcessingStatus = z.infer<typeof DocumentProcessingStatusSchema>;

export const DocumentSecurityStatusSchema = z.enum(['scan_pending', 'clean', 'blocked']);
export type DocumentSecurityStatus = z.infer<typeof DocumentSecurityStatusSchema>;

export const ExtractionStatusSchema = z.enum([
  'pending_review',
  'confirmed',
  'rejected',
  'failed',
]);
export type ExtractionStatus = z.infer<typeof ExtractionStatusSchema>;

export const ExtractionProviderNameSchema = z.enum(['mock', 'anthropic', 'openai']);
export type ExtractionProviderName = z.infer<typeof ExtractionProviderNameSchema>;

export const ExtractableFieldNameSchema = z.enum([
  'title',
  'type',
  'vendorName',
  'amount',
  'currency',
  'billingFrequency',
  'renewalDate',
  'expirationDate',
  'noticePeriodDays',
  'autoRenew',
  'importantClauses',
]);
export type ExtractableFieldName = z.infer<typeof ExtractableFieldNameSchema>;

export const ExtractedValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type ExtractedValue = z.infer<typeof ExtractedValueSchema>;

export const ExtractedFieldItemSchema = z.object({
  fieldName: ExtractableFieldNameSchema,
  extractedValue: ExtractedValueSchema,
  confidence: z.number().min(0).max(1),
  sourcePage: z.number().int().positive().optional(),
  sourceSnippet: z.string().max(2_000).optional(),
  correctedValue: ExtractedValueSchema.optional(),
  correctedBy: z.string().uuid().optional(),
  correctedAt: z.string().datetime().optional(),
  requiresReview: z.boolean(),
});
export type ExtractedFieldItem = z.infer<typeof ExtractedFieldItemSchema>;

export const ExtractionProviderMetadataSchema = z.object({
  provider: ExtractionProviderNameSchema,
  model: z.string().min(1).max(255),
  requestId: z.string().max(255).optional(),
  durationMs: z.number().int().nonnegative(),
});
export type ExtractionProviderMetadata = z.infer<typeof ExtractionProviderMetadataSchema>;

export const ProvisionalExtractionResultSchema = z.object({
  fields: z.array(ExtractedFieldItemSchema).min(1).max(50),
  overallConfidence: z.number().min(0).max(1),
  providerMetadata: ExtractionProviderMetadataSchema,
});
export type ProvisionalExtractionResult = z.infer<typeof ProvisionalExtractionResultSchema>;

export const PresignUploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  fileSizeBytes: z.number().int().positive().max(26_214_400),
  mimeType: SupportedDocumentMimeTypeSchema,
});
export type PresignUploadRequest = z.infer<typeof PresignUploadRequestSchema>;

export const PresignUploadResponseSchema = z.object({
  documentId: z.string().uuid(),
  uploadUrl: z.string().url(),
  storagePath: z.string(),
  expiresInSeconds: z.number().int().positive().max(300),
});
export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

export const DocumentStatusResponseSchema = z.object({
  documentId: z.string().uuid(),
  originalFilename: z.string(),
  sanitizedFilename: z.string(),
  declaredMimeType: SupportedDocumentMimeTypeSchema,
  detectedMimeType: SupportedDocumentMimeTypeSchema.nullable(),
  fileSizeBytes: z.number().int().positive(),
  fileHashSha256: z.string().length(64).nullable(),
  processingStatus: DocumentProcessingStatusSchema,
  securityStatus: DocumentSecurityStatusSchema,
  stagingId: z.string().uuid().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DocumentStatusResponse = z.infer<typeof DocumentStatusResponseSchema>;

export const ExtractionStagingDetailSchema = z.object({
  stagingId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentPreviewUrl: z.string().url(),
  previewExpiresInSeconds: z.number().int().positive().max(300),
  filename: z.string(),
  mimeType: SupportedDocumentMimeTypeSchema,
  status: ExtractionStatusSchema,
  overallConfidence: z.number().min(0).max(1),
  fields: z.array(ExtractedFieldItemSchema),
  providerMetadata: ExtractionProviderMetadataSchema,
  reviewedBy: z.string().uuid().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ExtractionStagingDetail = z.infer<typeof ExtractionStagingDetailSchema>;

export const ConfirmExtractionRequestSchema = z.object({
  stagingId: z.string().uuid(),
  confirmedData: z.object({
    title: z.string().min(2).max(255),
    type: ObligationTypeSchema,
    vendorName: z.string().min(1).max(255),
    amount: z.number().nonnegative(),
    currency: z.string().length(3).default('USD'),
    billingFrequency: BillingFrequencySchema,
    renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expirationDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    noticePeriodDays: z.number().int().min(0).max(365).default(30),
    autoRenew: z.boolean().default(true),
    notes: z.string().max(10_000).optional(),
  }),
});
export type ConfirmExtractionRequest = z.infer<typeof ConfirmExtractionRequestSchema>;

export const RejectExtractionRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1_000),
});
export type RejectExtractionRequest = z.infer<typeof RejectExtractionRequestSchema>;
