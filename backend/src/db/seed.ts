import { db } from './connection.js';
import * as schema from './schema/index.js';
import { SessionService } from '../modules/auth/session.service.js';
import { calculateCancellationDeadline } from '../modules/obligations/deadline.calculator.js';

export async function seedDatabase(): Promise<void> {
  console.log('Seeding RenewalRadar demo SMB data (Acme Distribution Logistics)...');

  // 1. Create Demo Organization
  const [org] = await db
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
    console.log('Organization already seeded or database unavailable.');
    return;
  }

  // 2. Create Owner User
  const passwordHash = await SessionService.hashPassword('Password123!');
  const [owner] = await db
    .insert(schema.users)
    .values({
      email: 'ops@acmelogistics.com',
      passwordHash,
      fullName: 'Sarah Jenkins',
      emailVerifiedAt: new Date(),
    })
    .returning();

  if (!owner) {
    console.log('Owner user creation skipped.');
    return;
  }

  // 3. Create Organization Membership (Owner)
  await db.insert(schema.organizationMembers).values({
    organizationId: org.id,
    userId: owner.id,
    role: 'owner',
  });

  // 4. Seed Realistic Multi-Category SMB Obligations
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
      riskLevel: 'critical', // Cancellation deadline is 5 days away
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
      riskLevel: 'high', // Cancellation deadline exactly 14 days away
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

  for (const obl of sampleObligations) {
    const cancellationDeadline = calculateCancellationDeadline(
      obl.renewalDate,
      obl.noticePeriodDays,
    );

    await db.insert(schema.obligations).values({
      organizationId: org.id,
      title: obl.title,
      type: obl.type,
      amount: obl.amount,
      currency: obl.currency,
      billingFrequency: obl.billingFrequency,
      renewalDate: obl.renewalDate,
      noticePeriodDays: obl.noticePeriodDays,
      cancellationDeadline,
      autoRenew: obl.autoRenew,
      riskLevel: obl.riskLevel,
      tags: obl.tags,
      notes: obl.notes,
      internalOwnerId: owner.id,
      status: 'active',
    });
  }

  console.log(
    'Seeding complete: Acme Distribution Logistics provisioned with 6 diverse obligations.',
  );
}

// Auto-run when executed directly via tsx
if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
