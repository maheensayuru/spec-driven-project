import { z } from 'zod';
import { ObligationTypeSchema, BillingFrequencySchema } from './obligations.contract.js';

export const PresignUploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  fileSizeBytes: z.number().int().positive().max(26_214_400), // 25MB
  mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/tiff']),
});
export type PresignUploadRequest = z.infer<typeof PresignUploadRequestSchema>;

export const PresignUploadResponseSchema = z.object({
  documentId: z.string().uuid(),
  uploadUrl: z.string().url(),
  storagePath: z.string(),
  expiresInSeconds: z.number().int(),
});
export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

export const ExtractedFieldItemSchema = z.object({
  fieldName: z.string(),
  extractedValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  pageNumber: z.number().int().optional(),
  boundingSnippet: z.string().optional(),
  requiresReview: z.boolean(),
});
export type ExtractedFieldItem = z.infer<typeof ExtractedFieldItemSchema>;

export const ExtractionStagingDetailSchema = z.object({
  stagingId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentUrl: z.string().url(),
  filename: z.string(),
  status: z.enum(['pending_review', 'confirmed', 'rejected']),
  overallConfidence: z.number().min(0).max(1),
  fields: z.array(ExtractedFieldItemSchema),
  suggestedType: ObligationTypeSchema,
  suggestedVendor: z.string().optional(),
  suggestedAmount: z.number().optional(),
  suggestedRenewalDate: z.string().optional(),
  suggestedNoticePeriodDays: z.number().int().optional(),
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
    noticePeriodDays: z.number().int().min(0).max(365).default(30),
    autoRenew: z.boolean().default(true),
    notes: z.string().optional(),
  }),
});
export type ConfirmExtractionRequest = z.infer<typeof ConfirmExtractionRequestSchema>;
