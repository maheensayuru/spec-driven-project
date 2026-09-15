import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema/index.js';
import { closeDatabase, db } from './connection.js';
import { SessionService } from '../modules/auth/session.service.js';
import { calculateCancellationDeadline } from '../modules/obligations/deadline.calculator.js';

export async function seedDatabase(): Promise<void> {
  console.log('Seeding RenewalRadar demo SMB data (Acme Distribution Logistics)...');

  const passwordHash = await SessionService.hashPassword('Password123!');
  const seeded = await db.transaction(async (transaction) => {
    const [org] = await transaction
      .insert(schema.organizations)
      .values({
        name: 'Acme Distribution Logistics',
        slug: 'acme-logistics',
        defaultCurrency: 'USD',
        tier: 'business',
      })
      .onConflictDoNothing()
      .returning();

    if (!org) {
      return false;
    }

    const [owner] = await transaction
      .insert(schema.users)
      .values({
        email: 'ops@acmelogistics.com',
        passwordHash,
        fullName: 'Sarah Jenkins',
        emailVerifiedAt: new Date(),
      })
      .returning();

    await transaction.insert(schema.organizationMembers).values({
      organizationId: org.id,
      userId: owner.id,
      role: 'owner',
    });

    const sampleObligations = [
      {
        title: 'Fleet Commercial Auto & Liability Insurance',
        type: 'insurance',
        amount: '18500.00',
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-10-31',
        noticePeriodDays: 45,
        autoRenew: true,
        riskLevel: 'critical',
        tags: ['insurance', 'compliance', 'vehicles'],
        notes:
          'State-mandated commercial auto insurance. Cancellation notice required 45 days prior.',
      },
      {
        title: 'Datadog APM & Cloud Infrastructure Monitoring',
        type: 'subscription',
        amount: '12000.00',
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-10-09',
        noticePeriodDays: 14,
        autoRenew: true,
        riskLevel: 'high',
        tags: ['saas', 'infra', 'monitoring'],
        notes: 'Monitors real-time warehouse logistics API servers.',
      },
      {
        title: 'Google Workspace Enterprise',
        type: 'subscription',
        amount: '4320.00',
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-11-15',
        noticePeriodDays: 30,
        autoRenew: true,
        riskLevel: 'medium',
        tags: ['saas', 'productivity', 'email'],
        notes: 'Company-wide email, cloud storage, and team communication.',
      },
      {
        title: 'Warehouse Commercial Lease (Building 4B)',
        type: 'lease',
        amount: '68000.00',
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2027-04-30',
        noticePeriodDays: 90,
        autoRenew: true,
        riskLevel: 'high',
        tags: ['facility', 'lease'],
        notes: 'Certified mail non-renewal notice must be postmarked 90 days before expiration.',
      },
      {
        title: 'Municipal Hazardous Materials Transport Permit',
        type: 'permit',
        amount: '1500.00',
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-12-31',
        noticePeriodDays: 30,
        autoRenew: false,
        riskLevel: 'low',
        tags: ['compliance', 'regulatory'],
        notes: 'Annual city transport renewal certificate.',
      },
      {
        title: 'Forklift Fleet Maintenance Agreement',
        type: 'vendor_agreement',
        amount: '9600.00',
        currency: 'USD',
        billingFrequency: 'quarterly',
        renewalDate: '2027-08-15',
        noticePeriodDays: 60,
        autoRenew: true,
        riskLevel: 'low',
        tags: ['equipment', 'warehouse'],
        notes: 'Quarterly preventative service on 8 Crown forklifts.',
      },
    ];

    for (const obligation of sampleObligations) {
      const cancellationDeadline = calculateCancellationDeadline(
        obligation.renewalDate,
        obligation.noticePeriodDays,
      );

      await transaction.insert(schema.obligations).values({
        organizationId: org.id,
        title: obligation.title,
        type: obligation.type,
        amount: obligation.amount,
        currency: obligation.currency,
        billingFrequency: obligation.billingFrequency,
        renewalDate: obligation.renewalDate,
        noticePeriodDays: obligation.noticePeriodDays,
        cancellationDeadline,
        autoRenew: obligation.autoRenew,
        riskLevel: obligation.riskLevel,
        tags: obligation.tags,
        notes: obligation.notes,
        internalOwnerId: owner.id,
        status: 'active',
      });
    }

    return true;
  });

  console.log(
    seeded
      ? 'Seeding complete: Acme Distribution Logistics provisioned with 6 diverse obligations.'
      : 'Canonical Acme Distribution Logistics dataset is already seeded.',
  );
}

const isDirectRun =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  seedDatabase()
    .catch((error: unknown) => {
      console.error('Seed error:', error);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}
