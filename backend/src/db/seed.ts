import { db } from './connection.js';
import * as schema from './schema/index.js';
import { SessionService } from '../modules/auth/session.service.js';
import { calculateCancellationDeadline } from '../modules/obligations/deadline.calculator.js';

export async function seedDatabase(): Promise<void> {
  console.log('Seeding RenewalRadar demo SMB data...');

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
    console.log('Organization already seeded. Skipping.');
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

  // 3. Create Organization Membership
  await db.insert(schema.organizationMembers).values({
    organizationId: org.id,
    userId: owner.id,
    role: 'owner',
  });

  // 4. Seed Realistic SMB Obligations
  const sampleObligations = [
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
      tags: ['saas', 'productivity'],
      notes: 'Company-wide email, cloud storage, and video conferencing.',
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
      notes: 'Requires certified mail non-renewal notice 90 days prior to lease end.',
    },
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
      tags: ['insurance', 'compliance'],
      notes: 'Mandatory state regulatory insurance policy for commercial vehicles.',
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

  console.log('Seeding complete: Acme Distribution Logistics provisioned with sample obligations.');
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
