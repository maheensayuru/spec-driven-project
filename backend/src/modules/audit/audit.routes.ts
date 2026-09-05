import { FastifyInstance, FastifyRequest } from 'fastify';
import { requirePermission } from '../auth/rbac.service.js';
import { AuditService } from './audit.service.js';
import { AuthenticatedRequest } from '../../server.js';
import { z } from 'zod';

const AuditQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function auditRoutes(server: FastifyInstance): Promise<void> {
  // GET /api/v1/audit - Restricted to Admin and Owner (FR-023)
  server.get(
    '/',
    { preHandler: [requirePermission('audit:read')] },
    async (request: FastifyRequest) => {
      const authReq = request as AuthenticatedRequest;
      const query = AuditQuerySchema.parse(request.query);

      const items = await AuditService.queryLogs(authReq.session!.organizationId, {
        entityType: query.entityType,
        entityId: query.entityId,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
      });

      return {
        items,
        page: query.page,
        limit: query.limit,
      };
    },
  );
}
