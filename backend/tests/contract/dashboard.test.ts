import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../src/modules/auth/session.service.js';

describe('Executive Dashboard Contract Tests (User Story 4 & FR-021)', () => {
  let app: FastifyInstance;
  const orgId = '55555555-5555-5555-5555-555555555555';
  const userId = '66666666-6666-6666-6666-666666666666';
  let sessionCookie: string;

  beforeAll(async () => {
    const token = SessionService.encryptSession({
      userId,
      organizationId: orgId,
      role: 'admin',
      email: 'finance@acme.corp',
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
          async list() {
            return [
              {
                id: 'obl-1',
                organizationId,
                vendorId: null,
                title: 'Google Workspace',
                type: 'subscription',
                status: 'active',
                amount: '1200.00',
                currency: 'USD',
                billingFrequency: 'annual',
                startDate: '2026-01-01',
                renewalDate: '2026-10-01',
                expirationDate: null,
                noticePeriodDays: 30,
                cancellationDeadline: '2026-09-01', // notice deadline passed -> overdue
                autoRenew: true,
                riskLevel: 'critical',
                internalOwnerId: null,
                tags: ['saas'],
                notes: null,
                version: 1,
                deletedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 'obl-2',
                organizationId,
                vendorId: null,
                title: 'AWS Cloud Hosting',
                type: 'contract',
                status: 'active',
                amount: '500.00',
                currency: 'USD',
                billingFrequency: 'monthly', // annualized = 6000
                startDate: '2026-01-01',
                renewalDate: '2026-11-15',
                expirationDate: null,
                noticePeriodDays: 30,
                cancellationDeadline: '2026-10-16',
                autoRenew: true,
                riskLevel: 'medium',
                internalOwnerId: null,
                tags: ['infrastructure'],
                notes: null,
                version: 1,
                deletedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ];
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

  it('rejects unauthenticated request to /api/v1/dashboard with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns valid executive metrics and urgent action items for authenticated tenant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.totalActiveObligations).toBe(2);
    expect(body.totalAnnualCommittedSpend).toBe(7200); // 1200 + (500 * 12)
    expect(body.reportingCurrency).toBe('USD');
    expect(body.urgentActions.length).toBeGreaterThan(0);
    expect(body.spendByCurrencyBreakdown.USD).toBe(7200);
    expect(body.spendByTypeBreakdown.subscription).toBe(1200);
    expect(body.spendByTypeBreakdown.contract).toBe(6000);
  });
});
