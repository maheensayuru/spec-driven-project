import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { SessionService, SessionData } from './modules/auth/session.service.js';
import { createTenantContext, TenantContext } from './db/connection.js';
import { obligationRoutes } from './modules/obligations/obligation.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { ingestionRoutes } from './modules/ingestion/ingestion.routes.js';

export interface AuthenticatedRequest extends FastifyRequest {
  session?: SessionData;
  tenant?: TenantContext;
}
export interface BuildServerOptions {
  tenantContextFactory?: (organizationId: string) => TenantContext;
}


export function buildServer(options?: BuildServerOptions): FastifyInstance {
  const server = Fastify({
    logger: env.NODE_ENV !== 'test',
  });

  // Plugins
  server.register(cors, {
    origin: [env.FRONTEND_URL],
    credentials: true,
  });

  server.register(cookie, {
    secret: env.SESSION_SECRET,
    hook: 'onRequest',
  });

  // Global Error Handler
  server.setErrorHandler((error: Error, _request: FastifyRequest, reply: FastifyReply) => {
    if (error.name === 'ZodError' || error instanceof ZodError) {
      const zodErr = error as ZodError;
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: zodErr.errors.map((e: { path: (string | number)[]; message: string }) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    server.log.error(error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  // Healthcheck endpoint
  server.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  });

  // Authentication & Tenant Context Hook
  server.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const sessionCookie = request.cookies['rr_session'];

    if (sessionCookie) {
      const session = SessionService.decryptSession(sessionCookie);
      if (session) {
        authReq.session = session;
        authReq.tenant = options?.tenantContextFactory
          ? options.tenantContextFactory(session.organizationId)
          : createTenantContext(session.organizationId);
      }
    }
  });
  // Register API domain routes
  server.register(obligationRoutes, { prefix: '/api/v1/obligations' });
  server.register(authRoutes, { prefix: '/api/v1/auth' });
  server.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  server.register(ingestionRoutes, { prefix: '/api/v1/ingestion' });


  return server;
}
