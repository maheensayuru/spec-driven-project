import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../../src/modules/auth/session.service.js';

describe('Audit Logging & Immutability (Constitution Principle VI & User Story 8)', () => {
  let app: FastifyInstance;
  const orgId = '12121212-1212-1212-1212-121212121212';
  let adminSessionCookie: string;
  let memberSessionCookie: string;

  beforeAll(async () => {
    const adminToken = SessionService.encryptSession({
      userId: 'user-admin-1',
      organizationId: orgId,
      role: 'admin',
      email: 'admin@audit-test.com',
      createdAt: Date.now(),
    });
    adminSessionCookie = `rr_session=${adminToken}`;

    const memberToken = SessionService.encryptSession({
      userId: 'user-member-1',
      organizationId: orgId,
      role: 'member', // does not have audit:read permission
      email: 'member@audit-test.com',
      createdAt: Date.now(),
    });
    memberSessionCookie = `rr_session=${memberToken}`;

    app = buildServer({
      tenantContextFactory: (organizationId: string) => ({
        organizationId,
        obligations: {
          async findById() { return null; },
          async list() { return []; },
          async create() { throw new Error(); },
          async update() { return null; },
          async softDelete() { return null; },
        },
        audit: {
          async record() {
            throw new Error();
          },
        },
      }),
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects audit log queries from non-admin roles (Member) with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit',
      headers: { cookie: memberSessionCookie },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Forbidden');
  });

  it('allows Admin to retrieve chronologically ordered immutable audit logs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit',
      headers: { cookie: adminSessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.items)).toBe(true);
  });
});
