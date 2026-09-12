import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../src/modules/auth/session.service.js';
import { NotificationService } from '../../src/modules/notifications/notification.service.js';

describe('Notification & Alert Monitoring API Contract Tests (Task T036)', () => {
  let app: FastifyInstance;
  const orgId = '99999999-8888-7777-6666-555555555555';
  let sessionCookie: string;

  beforeAll(async () => {
    const token = SessionService.encryptSession({
      userId: 'user-notif-1',
      organizationId: orgId,
      role: 'admin',
      email: 'alerts@renewalradar.corp',
      createdAt: Date.now(),
    });
    sessionCookie = `rr_session=${token}`;

    app = buildServer();
    await app.ready();

    // Register a sample alert in memory
    NotificationService.registerMockAlert({
      id: 'alert-sample-1',
      organizationId: orgId,
      obligationId: 'obl-123',
      milestone: '14_day',
      triggerDate: '2026-09-05',
      priority: 'critical',
      idempotencyKey: `${orgId}:obl-123:14_day:2026-09-05`,
      inAppDelivered: true,
      emailDelivered: false,
      acknowledgedAt: null,
      acknowledgedBy: null,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests to notifications endpoint with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns list of alerts and unread count on GET /api/v1/notifications (200 OK)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.unreadCount).toBeGreaterThan(0);
  });

  it('acknowledges an alert on POST /api/v1/notifications/:id/acknowledge (200 OK)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/alert-sample-1/acknowledge',
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('executes manual development scan on POST /api/v1/notifications/scan (200 OK)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/scan',
      headers: { cookie: sessionCookie },
      payload: {
        referenceDate: '2026-09-05',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.scanned).toBeDefined();
    expect(body.alertsCreated).toBeDefined();
  });
});
