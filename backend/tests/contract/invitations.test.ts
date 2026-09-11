import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../src/modules/auth/session.service.js';
import { OrganizationService } from '../../src/modules/organizations/organization.service.js';

describe('Organization Invitations & Member Management Contract Tests (Task T024)', () => {
  let app: FastifyInstance;
  const orgId = '77777777-7777-7777-7777-777777777777';
  const ownerUserId = 'owner-1111-1111-1111-111111111111';
  const memberUserId = 'member-2222-2222-2222-222222222222';
  const viewerUserId = 'viewer-3333-3333-3333-333333333333';

  let ownerCookie: string;
  let memberCookie: string;
  let viewerCookie: string;

  beforeAll(async () => {
    // Owner
    const ownerToken = SessionService.encryptSession({
      userId: ownerUserId,
      organizationId: orgId,
      role: 'owner',
      email: 'owner@renewalradar.corp',
      createdAt: Date.now(),
    });
    ownerCookie = `rr_session=${ownerToken}`;

    // Member
    const memberToken = SessionService.encryptSession({
      userId: memberUserId,
      organizationId: orgId,
      role: 'member',
      email: 'member@renewalradar.corp',
      createdAt: Date.now(),
    });
    memberCookie = `rr_session=${memberToken}`;

    // Viewer
    const viewerToken = SessionService.encryptSession({
      userId: viewerUserId,
      organizationId: orgId,
      role: 'viewer',
      email: 'viewer@renewalradar.corp',
      createdAt: Date.now(),
    });
    viewerCookie = `rr_session=${viewerToken}`;

    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests to organization routes with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/organizations/members',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects member invitation attempts from a Viewer or Member with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/invitations',
      headers: { cookie: viewerCookie },
      payload: {
        email: 'colleague@renewalradar.corp',
        role: 'viewer',
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects invalid email or invalid role payload on invitation with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/invitations',
      headers: { cookie: ownerCookie },
      payload: {
        email: 'not-an-email',
        role: 'superadmin', // Invalid role
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('allows Owner or Admin to invite a new team member as Viewer (201 Created)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/invitations',
      headers: { cookie: ownerCookie },
      payload: {
        email: 'legal.intern@renewalradar.corp',
        role: 'viewer',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.email).toBe('legal.intern@renewalradar.corp');
    expect(body.role).toBe('viewer');
    expect(body.token).toBeDefined();
    expect(body.expiresAt).toBeDefined();
  });

  it('allows accepting an invitation token via POST /api/v1/organizations/invitations/accept (200 OK)', async () => {
    // Create an invite first
    const invite = await OrganizationService.createInvitation(orgId, {
      email: 'newhire@renewalradar.corp',
      role: 'viewer',
      invitedBy: ownerUserId,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/invitations/accept',
      payload: {
        token: invite.token,
        fullName: 'New Hire Reviewer',
        password: 'SecurePassword123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.organization.id).toBe(orgId);
    expect(body.organization.role).toBe('viewer');
    expect(body.user.email).toBe('newhire@renewalradar.corp');
  });

  it('lists organization members on GET /api/v1/organizations/members (200 OK)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/organizations/members',
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.items)).toBe(true);
  });
});
