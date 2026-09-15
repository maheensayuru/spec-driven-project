import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { resetTestDatabase, testDb } from '../../helpers/test-database.js';
import * as schema from '../../../src/db/schema/index.js';

// The mock factory is hoisted, so importing the initialized test DB inside it avoids TDZ access.
vi.mock('../../../src/db/client.js', async () => {
  const { testDb } = await import('../../helpers/test-database.js');
  return { db: testDb };
});

import { ObligationRepository } from '../../../src/modules/obligations/obligation.repository.js';
import { ObligationService } from '../../../src/modules/obligations/obligation.service.js';
import type { TenantContext } from '../../../src/db/connection.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const otherOrganizationId = '22222222-2222-4222-8222-222222222222';

function tenantContext(id: string): TenantContext {
  return {
    organizationId: id,
    obligations: {
      findById: (obligationId) => ObligationRepository.findById(id, obligationId),
      list: (filter) => ObligationRepository.list(id, filter),
      findOrCreateVendor: (name) => ObligationRepository.findOrCreateVendor(id, name),
      create: (data) => ObligationRepository.create(id, data),
      update: (obligationId, data) => ObligationRepository.update(id, obligationId, data),
      softDelete: (obligationId) => ObligationRepository.softDelete(id, obligationId),
    },
    audit: {
      async record(entityType, entityId, action, details) {
        return {
          id: crypto.randomUUID(),
          organizationId: id,
          actorId: details?.actorId ?? null,
          entityType,
          entityId,
          action,
          beforeState: details?.beforeState ?? null,
          afterState: details?.afterState ?? null,
          ipAddress: details?.ipAddress ?? null,
          userAgent: details?.userAgent ?? null,
          createdAt: new Date(),
        };
      },
    },
  };
}

async function createObligation(
  tenant: TenantContext,
  title: string,
  type: 'contract' | 'subscription',
  status: 'active' | 'draft',
  vendorName: string,
  tags: string[],
) {
  return ObligationService.createObligation(tenant, {
    title,
    type,
    status,
    vendorName,
    tags,
    amount: 100,
    currency: 'USD',
    billingFrequency: 'annual',
    renewalDate: '2027-12-31',
    noticePeriodDays: 30,
    autoRenew: true,
  });
}

describe('obligation SQL filtering and form-field persistence', () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await testDb.insert(schema.organizations).values([
      { id: organizationId, name: 'Primary', slug: 'primary' },
      { id: otherOrganizationId, name: 'Other', slug: 'other' },
    ]);
  });

  it('filters tenant-scoped results by search, type, and status and paginates without overlap', async () => {
    const tenant = tenantContext(organizationId);
    const alpha = await createObligation(
      tenant,
      'Alpha Hosting',
      'subscription',
      'active',
      'Northwind Cloud',
      ['infrastructure'],
    );
    const beta = await createObligation(
      tenant,
      'Beta Agreement',
      'contract',
      'draft',
      'Contoso Legal',
      ['legal-review'],
    );
    await createObligation(tenant, 'Gamma Tools', 'subscription', 'draft', 'Fabrikam', ['devtools']);
    await createObligation(tenant, 'Delta Contract', 'contract', 'active', 'Adventure Works', ['office']);
    await createObligation(
      tenantContext(otherOrganizationId),
      'Leaked Northwind record',
      'subscription',
      'active',
      'Northwind Cloud',
      ['infrastructure'],
    );

    const byTitle = await ObligationService.listObligations(tenant, {
      search: 'alpha',
      page: 1,
      limit: 20,
    });
    const byVendor = await ObligationService.listObligations(tenant, {
      search: 'northwind',
      page: 1,
      limit: 20,
    });
    const byTag = await ObligationService.listObligations(tenant, {
      search: 'legal-review',
      page: 1,
      limit: 20,
    });
    const filtered = await ObligationService.listObligations(tenant, {
      type: 'contract',
      status: 'draft',
      page: 1,
      limit: 20,
    });
    const firstPage = await ObligationService.listObligations(tenant, { page: 1, limit: 2 });
    const secondPage = await ObligationService.listObligations(tenant, { page: 2, limit: 2 });

    expect(byTitle.items.map(({ id }) => id)).toEqual([alpha.id]);
    expect(byVendor.items.map(({ id }) => id)).toEqual([alpha.id]);
    expect(byTag.items.map(({ id }) => id)).toEqual([beta.id]);
    expect(filtered.items.map(({ id }) => id)).toEqual([beta.id]);
    expect(firstPage.total).toBe(4);
    expect(secondPage.total).toBe(4);
    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(2);
    expect(firstPage.items.some(({ id }) => secondPage.items.some((item) => item.id === id))).toBe(
      false,
    );
  });

  it('limits upcoming results to non-overdue cancellation deadlines within the requested window', async () => {
    const tenant = tenantContext(organizationId);
    const withinWindow = await createObligation(
      tenant,
      'Upcoming deadline',
      'contract',
      'active',
      'Upcoming Vendor',
      [],
    );
    const outsideWindow = await createObligation(
      tenant,
      'Later deadline',
      'contract',
      'active',
      'Later Vendor',
      [],
    );
    const overdue = await createObligation(
      tenant,
      'Overdue deadline',
      'contract',
      'active',
      'Overdue Vendor',
      [],
    );
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateFromToday = (days: number) =>
      new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);
    await Promise.all([
      ObligationRepository.update(organizationId, withinWindow.id, {
        cancellationDeadline: dateFromToday(10),
      }),
      ObligationRepository.update(organizationId, outsideWindow.id, {
        cancellationDeadline: dateFromToday(31),
      }),
      ObligationRepository.update(organizationId, overdue.id, {
        cancellationDeadline: dateFromToday(-1),
      }),
    ]);

    const result = await ObligationService.listObligations(tenant, {
      upcomingDays: 30,
      page: 1,
      limit: 20,
    });

    expect(result.items.map(({ id }) => id)).toEqual([withinWindow.id]);
    expect(result.total).toBe(1);
  });

  it('persists and returns vendor and tags through create and edit', async () => {
    const tenant = tenantContext(organizationId);
    const created = await createObligation(
      tenant,
      'Security Platform',
      'subscription',
      'active',
      'Original Vendor',
      ['security', 'saas'],
    );

    expect(created.vendorName).toBe('Original Vendor');
    expect(created.tags).toEqual(['security', 'saas']);

    const updated = await ObligationService.updateObligation(tenant, created.id, {
      vendorName: 'Replacement Vendor',
      tags: ['security', 'renewed'],
    });
    const fetched = await ObligationService.getObligationById(tenant, created.id);
    const listed = await ObligationService.listObligations(tenant, { page: 1, limit: 20 });

    expect(updated?.vendorName).toBe('Replacement Vendor');
    expect(updated?.tags).toEqual(['security', 'renewed']);
    expect(fetched?.vendorName).toBe('Replacement Vendor');
    expect(fetched?.tags).toEqual(['security', 'renewed']);
    expect(listed.items[0]?.vendorName).toBe('Replacement Vendor');
    expect(await testDb.select().from(schema.vendors).where(eq(schema.vendors.organizationId, organizationId))).toHaveLength(2);
  });
});
