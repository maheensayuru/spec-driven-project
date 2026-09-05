import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateObligationRequestSchema,
  ListObligationsQuerySchema,
} from '@renewalradar/shared';
import { ObligationService } from './obligation.service.js';
import { requirePermission } from '../auth/rbac.service.js';
import { EntitlementService } from '../entitlements/entitlement.service.js';
import { AuthenticatedRequest } from '../../server.js';
import { z } from 'zod';

const ParamsWithIdSchema = z.object({
  id: z.string().uuid(),
});

export async function obligationRoutes(server: FastifyInstance): Promise<void> {
  // Authentication Guard Middleware
  server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    if (!authReq.session || !authReq.tenant) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Valid session cookie required',
      });
    }
  });

  // POST /api/v1/obligations - Create an obligation
  server.post('/', { preHandler: [requirePermission('obligations:create')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const validated = CreateObligationRequestSchema.parse(request.body);
    // Quota Enforcement (FR-024 & FR-025)
    const existing = await authReq.tenant!.obligations.list(1000);
    const quota = EntitlementService.checkObligationQuota(existing.length, 'free');
    if (!quota.allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        code: 'QUOTA_EXCEEDED',
        message: quota.message,
        suggestedTier: quota.suggestedTier,
      });
    }


    const obligation = await ObligationService.createObligation(
      authReq.tenant!,
      validated,
      authReq.session?.userId,
    );

    return reply.status(201).send(obligation);
  });

  // GET /api/v1/obligations - List obligations
  server.get('/', async (request: FastifyRequest) => {
    const authReq = request as AuthenticatedRequest;
    const query = ListObligationsQuerySchema.parse(request.query);

    const list = await ObligationService.listObligations(authReq.tenant!, query);
    return {
      items: list,
      page: query.page,
      limit: query.limit,
    };
  });

  // GET /api/v1/obligations/:id - Get obligation by ID
  server.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = ParamsWithIdSchema.parse(request.params);

    const obligation = await ObligationService.getObligationById(authReq.tenant!, id);
    if (!obligation) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Obligation not found',
      });
    }

    return obligation;
  });

  // PATCH /api/v1/obligations/:id - Update obligation
  server.patch('/:id', { preHandler: [requirePermission('obligations:update')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = ParamsWithIdSchema.parse(request.params);
    const updates = CreateObligationRequestSchema.partial().parse(request.body);

    const updated = await ObligationService.updateObligation(
      authReq.tenant!,
      id,
      updates,
      authReq.session?.userId,
    );

    if (!updated) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Obligation not found',
      });
    }

    return updated;
  });

  // DELETE /api/v1/obligations/:id - Soft delete obligation
  server.delete('/:id', { preHandler: [requirePermission('obligations:delete')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = ParamsWithIdSchema.parse(request.params);

    const deleted = await ObligationService.deleteObligation(
      authReq.tenant!,
      id,
      authReq.session?.userId,
    );

    if (!deleted) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Obligation not found',
      });
    }

    return reply.status(204).send();
  });

  // POST /api/v1/obligations/:id/renew - Renew obligation
  server.post('/:id/renew', { preHandler: [requirePermission('obligations:update')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = ParamsWithIdSchema.parse(request.params);

    const renewed = await ObligationService.renewObligation(
      authReq.tenant!,
      id,
      authReq.session?.userId,
    );

    if (!renewed) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Obligation not found',
      });
    }

    return renewed;
  });
}
