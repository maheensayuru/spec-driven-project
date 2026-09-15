import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../src/modules/auth/session.service.js';
import crypto from 'node:crypto';
import { Obligation } from '../../src/db/schema/obligations.js';

describe('Obligations API Contract Tests (User Story 1 & Task T014)', () => {
  let app: FastifyInstance;
  const orgId = '33333333-3333-3333-3333-333333333333';
  const userId = '44444444-4444-4444-4444-444444444444';
  let sessionCookie: string;
  const inMemoryStore = new Map<string, Obligation>();
  const vendorStore = new Map<string, { id: string; name: string }>();

  beforeAll(async () => {
    const token = SessionService.encryptSession({
      userId,
      organizationId: orgId,
      role: 'admin',
      email: 'admin@acme.corp',
      createdAt: Date.now(),
    });
    sessionCookie = `rr_session=${token}`;

    app = buildServer({
      tenantContextFactory: (organizationId: string) => ({
        organizationId,
        obligations: {
          async findById(id: string) {
            const item = inMemoryStore.get(id);
            if (!item || item.organizationId !== organizationId || item.deletedAt) {
              return null;
            }
            const vendor = item.vendorId ? vendorStore.get(item.vendorId) : undefined;
            return vendor ? { ...item, vendorName: vendor.name } : item;
          },
          async list(filter = {}) {
            const matches = Array.from(inMemoryStore.values()).filter((item) => {
              if (item.organizationId !== organizationId || item.deletedAt) return false;
              if (filter.type && item.type !== filter.type) return false;
              if (filter.status && item.status !== filter.status) return false;
              if (filter.riskLevel && item.riskLevel !== filter.riskLevel) return false;
              if (filter.search) {
                const vendorName = item.vendorId ? vendorStore.get(item.vendorId)?.name : undefined;
                const searchable = [item.title, vendorName, ...(item.tags as string[])].join(' ');
                if (!searchable.toLowerCase().includes(filter.search.toLowerCase())) return false;
              }
              return true;
            });
            const offset = filter.offset ?? 0;
            const limit = filter.limit ?? 50;
            return {
              items: matches.slice(offset, offset + limit).map((item) => {
                const vendor = item.vendorId ? vendorStore.get(item.vendorId) : undefined;
                return vendor ? { ...item, vendorName: vendor.name } : item;
              }),
              total: matches.length,
            };
          },
          async findOrCreateVendor(name: string) {
            const existing = Array.from(vendorStore.values()).find(
              (vendor) => vendor.name.toLowerCase() === name.toLowerCase(),
            );
            if (existing) {
              return {
                ...existing,
                organizationId,
                contactEmail: null,
                website: null,
                notes: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            }
            const vendor = { id: crypto.randomUUID(), name };
            vendorStore.set(vendor.id, vendor);
            return {
              ...vendor,
              organizationId,
              contactEmail: null,
              website: null,
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
          async create(data) {
            const id = crypto.randomUUID();
            const now = new Date();
            const record: Obligation = {
              id,
              organizationId,
              vendorId: data.vendorId ?? null,
              title: data.title,
              type: data.type,
              status: data.status ?? 'active',
              amount: data.amount,
              currency: data.currency ?? 'USD',
              billingFrequency: data.billingFrequency,
              startDate: data.startDate ?? null,
              renewalDate: data.renewalDate,
              expirationDate: data.expirationDate ?? null,
              noticePeriodDays: data.noticePeriodDays ?? 30,
              cancellationDeadline: data.cancellationDeadline,
              autoRenew: data.autoRenew ?? true,
              riskLevel: data.riskLevel ?? 'low',
              internalOwnerId: data.internalOwnerId ?? null,
              tags: (data.tags as unknown[]) ?? [],
              notes: data.notes ?? null,
              version: 1,
              deletedAt: null,
              createdAt: now,
              updatedAt: now,
            };
            inMemoryStore.set(id, record);
            return record;
          },
          async update(id: string, data) {
            const existing = inMemoryStore.get(id);
            if (!existing || existing.organizationId !== organizationId || existing.deletedAt) {
              return null;
            }
            const updated: Obligation = {
              ...existing,
              ...data,
              amount: data.amount !== undefined ? String(data.amount) : existing.amount,
              updatedAt: new Date(),
            } as Obligation;
            inMemoryStore.set(id, updated);
            return updated;
          },
          async softDelete(id: string) {
            const existing = inMemoryStore.get(id);
            if (!existing || existing.organizationId !== organizationId || existing.deletedAt) {
              return null;
            }
            const deleted: Obligation = {
              ...existing,
              deletedAt: new Date(),
            };
            inMemoryStore.set(id, deleted);
            return deleted;
          },
        },
        audit: {
          async record() {
            return {
              id: 'mock-audit',
              organizationId,
              actorId: null,
              entityType: 'obligation',
              entityId: 'test',
              action: 'test',
              beforeState: null,
              afterState: null,
              ipAddress: null,
              userAgent: null,
              createdAt: new Date(),
            };
          },
        },
      }),
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests to obligations endpoints with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/obligations',
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates required fields on POST /api/v1/obligations with 400 on invalid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/obligations',
      headers: { cookie: sessionCookie },
      payload: {
        title: '',
        amount: -10,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Bad Request');
  });

  it('creates an obligation with 201, organizationId scoping, and calculated cancellation deadline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/obligations',
      headers: { cookie: sessionCookie },
      payload: {
        title: 'Google Workspace Enterprise',
        type: 'subscription',
        vendorName: 'Google',
        amount: 2400,
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-11-15',
        noticePeriodDays: 30,
        autoRenew: true,
        tags: ['saas', 'productivity'],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.organizationId).toBe(orgId);
    expect(body.title).toBe('Google Workspace Enterprise');
    expect(body.status).toBe('active');
    expect(body.cancellationDeadline).toBe('2026-10-16'); // 2026-11-15 - 30 days
    expect(body.vendorName).toBe('Google');
    expect(body.tags).toEqual(['saas', 'productivity']);
  });

  it('retrieves the created obligation by ID on GET /api/v1/obligations/:id', async () => {
    // Create one first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/obligations',
      headers: { cookie: sessionCookie },
      payload: {
        title: 'Datadog APM',
        type: 'subscription',
        vendorName: 'Datadog',
        amount: 12000,
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-12-01',
        noticePeriodDays: 60,
        autoRenew: true,
      },
    });
    const created = JSON.parse(createRes.body);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/obligations/${created.id}`,
      headers: { cookie: sessionCookie },
    });

    expect(getRes.statusCode).toBe(200);
    const fetched = JSON.parse(getRes.body);
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe('Datadog APM');
    expect(fetched.cancellationDeadline).toBe('2026-10-02');
    expect(fetched.vendorName).toBe('Datadog');
  });

  it('returns 404 for non-existent obligation ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/obligations/00000000-0000-0000-0000-000000000000',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates an obligation and recalculates cancellation deadline on PATCH /api/v1/obligations/:id', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/obligations',
      headers: { cookie: sessionCookie },
      payload: {
        title: 'Zoom Rooms License',
        type: 'license',
        vendorName: 'Zoom',
        tags: ['video'],
        amount: 499,
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2026-10-31',
        noticePeriodDays: 30,
        autoRenew: true,
      },
    });
    const created = JSON.parse(createRes.body);

    // Update notice period from 30 to 45 days
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/obligations/${created.id}`,
      headers: { cookie: sessionCookie },
      payload: {
        noticePeriodDays: 45,
        vendorName: 'Zoom Communications',
        tags: ['video', 'renewal'],
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const updated = JSON.parse(patchRes.body);
    expect(updated.noticePeriodDays).toBe(45);
    expect(updated.cancellationDeadline).toBe('2026-09-16'); // 2026-10-31 - 45 days
    expect(updated.version).toBe(2);
    expect(updated.vendorName).toBe('Zoom Communications');
    expect(updated.tags).toEqual(['video', 'renewal']);
  });

  it('lists obligations with pagination on GET /api/v1/obligations', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/obligations?page=1&limit=10',
      headers: { cookie: sessionCookie },
    });

    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.total).toBe(inMemoryStore.size);
  });

  it('soft deletes an obligation on DELETE /api/v1/obligations/:id', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/obligations',
      headers: { cookie: sessionCookie },
      payload: {
        title: 'Legacy Office Phone Contract',
        type: 'contract',
        amount: 150,
        currency: 'USD',
        billingFrequency: 'monthly',
        renewalDate: '2026-09-30',
        noticePeriodDays: 30,
        autoRenew: false,
      },
    });
    const created = JSON.parse(createRes.body);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/obligations/${created.id}`,
      headers: { cookie: sessionCookie },
    });

    expect(deleteRes.statusCode).toBe(204);

    // Verify it is no longer returned on GET
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/obligations/${created.id}`,
      headers: { cookie: sessionCookie },
    });
    expect(getRes.statusCode).toBe(404);
  });
});
