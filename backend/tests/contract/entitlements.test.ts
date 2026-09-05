import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../src/modules/auth/session.service.js';

describe('Entitlements API Contract Tests (User Story 7 & FR-025)', () => {
  let app: FastifyInstance;
  const orgId = '10101010-1010-1010-1010-101010101010';
  let sessionCookie: string;

  beforeAll(async () => {
    const token = SessionService.encryptSession({
      userId: 'user-free-1',
      organizationId: orgId,
      role: 'admin',
      email: 'owner@free-corp.com',
      createdAt: Date.now(),
    });
    sessionCookie = `rr_session=${token}`;

    app = buildServer({
      tenantContextFactory: (organizationId: string) => ({
        organizationId,
        obligations: {
          async findById() {
            return null;
          },
          // Simulate 10 existing obligations (at Free plan cap)
          async list() {
            return Array.from({ length: 10 }, (_, i) => ({
              id: `obl-${i}`,
              organizationId,
              vendorId: null,
              title: `Obligation ${i}`,
              type: 'subscription',
              status: 'active',
              amount: '100.00',
              currency: 'USD',
              billingFrequency: 'monthly',
              startDate: null,
              renewalDate: '2026-10-01',
              expirationDate: null,
              noticePeriodDays: 30,
              cancellationDeadline: '2026-09-01',
              autoRenew: true,
              riskLevel: 'low',
              internalOwnerId: null,
              tags: [],
              notes: null,
              version: 1,
              deletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
          },
          async create() {
            throw new Error('Should not be reached when quota is exceeded');
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

  it('rejects POST /api/v1/obligations when tenant reaches plan quota limit with 403 / upgrade guidance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/obligations',
      headers: { cookie: sessionCookie },
      payload: {
        title: '11th Obligation (Exceeds Limit)',
        type: 'subscription',
        amount: 250,
        currency: 'USD',
        billingFrequency: 'monthly',
        renewalDate: '2026-11-01',
        noticePeriodDays: 30,
        autoRenew: true,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Forbidden');
    expect(body.code).toBe('QUOTA_EXCEEDED');
    expect(body.suggestedTier).toBe('business');
  });
});
