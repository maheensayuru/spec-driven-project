import { z } from 'zod';

export const ObligationTypeSchema = z.enum([
  'contract',
  'subscription',
  'license',
  'permit',
  'insurance',
  'warranty',
  'vendor_agreement',
  'lease',
  'other',
]);
export type ObligationType = z.infer<typeof ObligationTypeSchema>;

export const ObligationStatusSchema = z.enum([
  'draft',
  'active',
  'under_review',
  'notice_given',
  'renewed',
  'expired',
  'terminated',
  'archived',
]);
export type ObligationStatus = z.infer<typeof ObligationStatusSchema>;

export const RiskLevelSchema = z.enum(['critical', 'high', 'medium', 'low']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const BillingFrequencySchema = z.enum([
  'monthly',
  'quarterly',
  'annual',
  'biennial',
  'one_time',
]);
export type BillingFrequency = z.infer<typeof BillingFrequencySchema>;

export const CreateObligationRequestSchema = z.object({
  title: z.string().min(2).max(255),
  type: ObligationTypeSchema,
  status: ObligationStatusSchema.default('active'),
  vendorName: z.string().min(1).max(255).optional(),
  amount: z.number().nonnegative(),
  currency: z.string().length(3).default('USD'),
  billingFrequency: BillingFrequencySchema,
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  noticePeriodDays: z.number().int().min(0).max(365).default(30),
  autoRenew: z.boolean().default(true),
  internalOwnerId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().max(4000).optional(),
});
export type CreateObligationRequest = z.infer<typeof CreateObligationRequestSchema>;

export const ObligationResponseSchema = CreateObligationRequestSchema.extend({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  vendorId: z.string().uuid().nullable(),
  cancellationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: ObligationStatusSchema,
  riskLevel: RiskLevelSchema,
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ObligationResponse = z.infer<typeof ObligationResponseSchema>;

export const ListObligationsQuerySchema = z.object({
  type: ObligationTypeSchema.optional(),
  status: ObligationStatusSchema.optional(),
  riskLevel: RiskLevelSchema.optional(),
  search: z.string().max(100).optional(),
  upcomingDays: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListObligationsQuery = z.infer<typeof ListObligationsQuerySchema>;
