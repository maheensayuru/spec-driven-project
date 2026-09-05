import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../src/modules/auth/session.service.js';

describe('Obligations API Contract Tests (User Story 1)', () => {
  let app: FastifyInstance;
  const orgId = '33333333-3333-3333-3333-333333333333';
  const userId = '44444444-4444-4444-4444-444444444444';
  let sessionCookie: string;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();

    const token = SessionService.encryptSession({
      userId,
      organizationId: orgId,
      role: 'admin',
      email: 'admin@acme.corp',
      createdAt: Date.now(),
    });
    sessionCookie = `rr_session=${token}`;
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
        title: '', // Invalid empty title
        amount: -10, // Invalid negative amount
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Bad Request');
  });
});
