import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../../src/modules/auth/session.service.js';

describe('Multi-Tenant Isolation & Zero Trust (Constitution Principle II & Task T023)', () => {
  let app: FastifyInstance;
  const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const orgAObId = '11111111-1111-1111-1111-111111111111';

  let orgAAdminCookie: string;
  let orgAViewerCookie: string;
  let orgBAdminCookie: string;

  beforeAll(async () => {
    // Org A Admin
    const tokenAdminA = SessionService.encryptSession({
      userId: 'user-a-admin',
      organizationId: orgA,
      role: 'admin',
      email: 'admin@org-a.com',
      createdAt: Date.now(),
    });
    orgAAdminCookie = `rr_session=${tokenAdminA}`;

    // Org A Viewer
    const tokenViewerA = SessionService.encryptSession({
      userId: 'user-a-viewer',
      organizationId: orgA,
      role: 'viewer',
      email: 'viewer@org-a.com',
      createdAt: Date.now(),
    });
    orgAViewerCookie = `rr_session=${tokenViewerA}`;

    // Org B Admin
    const tokenAdminB = SessionService.encryptSession({
      userId: 'user-b-admin',
      organizationId: orgB,
      role: 'admin',
      email: 'admin@org-b.com',
      createdAt: Date.now(),
    });
    orgBAdminCookie = `rr_session=${tokenAdminB}`;

    app = buildServer({
      tenantContextFactory: (organizationId: string) => ({
        organizationId,
        obligations: {
          async findById(id: string) {
            if (id === orgAObId && organizationId === orgA) {
              return {
                id: orgAObId,
                organizationId: orgA,
                vendorId: null,
                title: 'Org A Confidential Contract',
                type: 'contract',
                status: 'active',
                amount: '5000.00',
                currency: 'USD',
                billingFrequency: 'annual',
                startDate: null,
                renewalDate: '2026-12-31',
                expirationDate: null,
                noticePeriodDays: 30,
                cancellationDeadline: '2026-12-01',
                autoRenew: true,
                riskLevel: 'low',
                internalOwnerId: null,
                tags: [],
                notes: null,
                version: 1,
                deletedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            }
            return null;
          },
          async findOrCreateVendor() { throw new Error('Unexpected vendor lookup in this test'); },
          async list() {
            if (organizationId === orgA) {
              const items = [
                {
                  id: orgAObId,
                  organizationId: orgA,
                  vendorId: null,
                  title: 'Org A Confidential Contract',
                  type: 'contract',
                  status: 'active',
                  amount: '5000.00',
                  currency: 'USD',
                  billingFrequency: 'annual',
                  startDate: null,
                  renewalDate: '2026-12-31',
                  expirationDate: null,
                  noticePeriodDays: 30,
                  cancellationDeadline: '2026-12-01',
                  autoRenew: true,
                  riskLevel: 'low',
                  internalOwnerId: null,
                  tags: [],
                  notes: null,
                  version: 1,
                  deletedAt: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ];
              return { items, total: items.length };
            }
            return { items: [], total: 0 };
          },
          async create() {
            throw new Error('Not implemented in mock');
          },
          async update() {
            return null;
          },
          async softDelete() {
            return null;
          },
        },
        audit: {
          async record() {
            return {
              id: 'mock-audit',
              organizationId,
              actorId: null,
              entityType: 'test',
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

  it('allows Viewer in Org A to read obligations (200 OK)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/obligations',
      headers: { cookie: orgAViewerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.length).toBe(1);
    expect(body.items[0].title).toBe('Org A Confidential Contract');
  });

  it('rejects mutative requests from Viewer with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/obligations',
      headers: { cookie: orgAViewerCookie },
      payload: {
        title: 'Unauthorized Mutation Attempt',
        type: 'subscription',
        amount: 100,
        currency: 'USD',
        billingFrequency: 'monthly',
        renewalDate: '2026-10-01',
        noticePeriodDays: 30,
        autoRenew: true,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 404 (Not Found) when Org B requests an obligation belonging to Org A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/obligations/${orgAObId}`,
      headers: { cookie: orgBAdminCookie },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 (Not Found) for non-existent resource ID to prevent enumeration', async () => {
    const foreignId = '99999999-9999-9999-9999-999999999999';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/obligations/${foreignId}`,
      headers: { cookie: orgAAdminCookie },
    });

    expect(res.statusCode).toBe(404);
  });
});
