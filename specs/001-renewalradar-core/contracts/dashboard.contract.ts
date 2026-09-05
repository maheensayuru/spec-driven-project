import { z } from 'zod';
import { ObligationResponseSchema, RiskLevelSchema } from './obligations.contract';

export const UrgentActionItemSchema = z.object({
  id: z.string().uuid(),
  obligationId: z.string().uuid(),
  title: z.string(),
  vendor: z.string().optional(),
  actionType: z.enum(['notice_deadline_approaching', 'renewal_approaching', 'price_increase_detected', 'pending_verification']),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysRemaining: z.number().int(),
  riskLevel: RiskLevelSchema,
  amount: z.number(),
  currency: z.string().length(3),
});
export type UrgentActionItem = z.infer<typeof UrgentActionItemSchema>;

export const DashboardMetricsResponseSchema = z.object({
  totalActiveObligations: z.number().int(),
  totalAnnualCommittedSpend: z.number(),
  reportingCurrency: z.string().length(3),
  imminentNoticeDeadlinesCount: z.number().int(), // <= 30 days
  imminentRenewalsCount: z.number().int(),        // <= 30 days
  pendingVerificationDocumentsCount: z.number().int(),
  urgentActions: z.array(UrgentActionItemSchema),
  upcomingRenewalsTimeline: z.array(ObligationResponseSchema),
  spendByCurrencyBreakdown: z.record(z.string(), z.number()),
  spendByTypeBreakdown: z.record(z.string(), z.number()),
});
export type DashboardMetricsResponse = z.infer<typeof DashboardMetricsResponseSchema>;
