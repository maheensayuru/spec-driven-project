import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RegisterRequestSchema, LoginRequestSchema, AuthSession } from '@renewalradar/shared';
import { SessionService } from './session.service.js';
import { AuthenticatedRequest } from '../../server.js';
import { db } from '../../db/connection.js';
import * as schema from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export async function authRoutes(server: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/register
  server.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const input = RegisterRequestSchema.parse(request.body);

    const passwordHash = await SessionService.hashPassword(input.password);
    const slug =
      input.organizationName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'org';

    // 1. Create User
    const [user] = await db
      .insert(schema.users)
      .values({
        email: input.email.toLowerCase().trim(),
        passwordHash,
        fullName: input.fullName.trim(),
      })
      .returning();

    // 2. Create Organization
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: input.organizationName.trim(),
        slug: `${slug}-${Math.random().toString(36).substring(2, 6)}`,
        defaultCurrency: input.defaultCurrency,
        tier: 'free',
      })
      .returning();

    // 3. Create Owner Membership
    await db.insert(schema.organizationMembers).values({
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
    });

    const sessionPayload = {
      userId: user.id,
      organizationId: organization.id,
      role: 'owner' as const,
      email: user.email,
      createdAt: Date.now(),
    };

    const cookieToken = SessionService.encryptSession(sessionPayload);
    reply.setCookie('rr_session', cookieToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // true in production behind HTTPS
    });

    const response: AuthSession = {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        tier: 'free',
        role: 'owner',
        defaultCurrency: organization.defaultCurrency,
      },
    };

    return reply.status(201).send(response);
  });

  // POST /api/v1/auth/login
  server.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const input = LoginRequestSchema.parse(request.body);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, input.email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const isValidPassword = await SessionService.verifyPassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Load organization membership
    const [membership] = await db
      .select({
        role: schema.organizationMembers.role,
        orgId: schema.organizations.id,
        orgName: schema.organizations.name,
        orgSlug: schema.organizations.slug,
        orgTier: schema.organizations.tier,
        orgCurrency: schema.organizations.defaultCurrency,
      })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMembers.organizationId, schema.organizations.id),
      )
      .where(eq(schema.organizationMembers.userId, user.id))
      .limit(1);

    if (!membership) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'User does not belong to any organization',
      });
    }

    const sessionPayload = {
      userId: user.id,
      organizationId: membership.orgId,
      role: membership.role as 'owner' | 'admin' | 'member' | 'viewer',
      email: user.email,
      createdAt: Date.now(),
    };

    const cookieToken = SessionService.encryptSession(sessionPayload);
    reply.setCookie('rr_session', cookieToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });

    const response: AuthSession = {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      organization: {
        id: membership.orgId,
        name: membership.orgName,
        slug: membership.orgSlug,
        tier: membership.orgTier as 'free' | 'business' | 'pro',
        role: membership.role as 'owner' | 'admin' | 'member' | 'viewer',
        defaultCurrency: membership.orgCurrency,
      },
    };

    return response;
  });

  // POST /api/v1/auth/logout
  server.post('/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('rr_session', { path: '/' });
    return { success: true };
  });

  // GET /api/v1/auth/me
  server.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    if (!authReq.session) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Not authenticated',
      });
    }

    return {
      session: authReq.session,
    };
  });
}
