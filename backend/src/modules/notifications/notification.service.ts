import { db } from '../../db/connection.js';
import * as schema from '../../db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';
import type { ObligationAlert } from '../../db/schema/alerts.js';

export interface EmailMessage {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ success: boolean; messageId: string }>;
}

/**
 * Development-safe mock logging email transport (Task T036).
 */
export class MockEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<{ success: boolean; messageId: string }> {
    const messageId = `msg-${Date.now()}`;
    return { success: true, messageId };
  }
}

export class NotificationService {
  private static emailProvider: EmailProvider = new MockEmailProvider();

  static setEmailProvider(provider: EmailProvider): void {
    this.emailProvider = provider;
  }

  /**
   * Retrieves notification alerts for an organization, ordered by newest first.
   */
  static async getOrganizationAlerts(
    organizationId: string,
    limit = 50,
  ): Promise<ObligationAlert[]> {
    return db
      .select()
      .from(schema.obligationAlerts)
      .where(eq(schema.obligationAlerts.organizationId, organizationId))
      .orderBy(desc(schema.obligationAlerts.createdAt))
      .limit(limit);
  }

  /**
   * Marks an alert as acknowledged by a specific user.
   */
  static async acknowledgeAlert(
    organizationId: string,
    alertId: string,
    userId: string,
  ): Promise<boolean> {
    const [updated] = await db
      .update(schema.obligationAlerts)
      .set({
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
      })
      .where(
        and(
          eq(schema.obligationAlerts.id, alertId),
          eq(schema.obligationAlerts.organizationId, organizationId),
        ),
      )
      .returning();

    return Boolean(updated);
  }

  /**
   * Dispatches email notifications with deduplication guard.
   */
  static async dispatchEmailAlert(
    recipientEmail: string,
    alert: ObligationAlert,
    obligationTitle: string,
  ): Promise<boolean> {
    if (alert.emailDelivered) {
      return false; // Prevent duplicate email dispatch
    }

    const res = await this.emailProvider.send({
      to: recipientEmail,
      subject: `[RenewalRadar] Alert: ${alert.priority.toUpperCase()} - ${obligationTitle}`,
      bodyText: `Notice for ${obligationTitle}. Milestone: ${alert.milestone}. Trigger date: ${alert.triggerDate}.`,
    });

    if (res.success) {
      await db
        .update(schema.obligationAlerts)
        .set({ emailDelivered: true })
        .where(eq(schema.obligationAlerts.id, alert.id));
    }

    return res.success;
  }
}
