import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../../src/modules/auth/session.service.js';

describe('Multi-Tenant Isolation & Zero Trust (Constitution Principle II & SC-005)', () => {
  let app: FastifyInstance;
  const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  let orgASessionCookie: string;
  let viewerSessionCookie: string;

  beforeAll(async () => {
    app = buildServer({
      tenantContextFactory: (organizationId: string) => ({
        organizationId,
        obligations: {
          async findById() {
            return null;
          },
          async list() {
            return [];
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

    // Org A Admin
    const tokenA = SessionService.encryptSession({
      userId: 'user-a-1',
      organizationId: orgA,
      role: 'admin',
      email: 'admin@org-a.com',
      createdAt: Date.now(),
    });
    orgASessionCookie = `rr_session=${tokenA}`;

    // Org A Viewer
    const tokenViewer = SessionService.encryptSession({
      userId: 'user-a-2',
      organizationId: orgA,
      role: 'viewer',
      email: 'viewer@org-a.com',
      createdAt: Date.now(),
    });
    viewerSessionCookie = `rr_session=${tokenViewer}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects mutative requests from Viewer with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/obligations',
      headers: { cookie: viewerSessionCookie },
      payload: {
        title: 'Unauthorized Attempt',
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

  it('returns 404 (Not Found) when requesting an obligation belonging to another tenant', async () => {
    const foreignId = '99999999-9999-9999-9999-999999999999';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/obligations/${foreignId}`,
      headers: { cookie: orgASessionCookie },
    });

    expect(res.statusCode).toBe(404);
  });
});
