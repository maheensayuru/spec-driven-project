import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { NotificationService } from './notification.service.js';
import { DeadlineScannerService } from '../monitoring/scanner.service.js';
import { AuthenticatedRequest } from '../../server.js';
import { env } from '../../config/env.js';

const AcknowledgeParamSchema = z.object({
  id: z.string(),
});

const ScanTriggerSchema = z.object({
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function notificationRoutes(server: FastifyInstance): Promise<void> {
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

  // GET /api/v1/notifications - List alerts for the authenticated organization
  server.get('/', async (request: FastifyRequest) => {
    const authReq = request as AuthenticatedRequest;
    const alerts = await NotificationService.getOrganizationAlerts(authReq.session!.organizationId);

    return {
      items: alerts,
      unreadCount: alerts.filter((a) => !a.acknowledgedAt).length,
      total: alerts.length,
    };
  });

  // POST /api/v1/notifications/:id/acknowledge - Acknowledge an alert
  server.post('/:id/acknowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = AcknowledgeParamSchema.parse(request.params);

    const success = await NotificationService.acknowledgeAlert(
      authReq.session!.organizationId,
      id,
      authReq.session!.userId,
    );

    if (!success) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Alert not found',
      });
    }

    return { success: true };
  });

  // POST /api/v1/notifications/scan - Development-only manual scanner trigger (Task T035)
  server.post('/scan', async (request: FastifyRequest, reply: FastifyReply) => {
    // In production, prohibit public manual scanning
    if (env.NODE_ENV === 'production') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Manual scan trigger disabled in production',
      });
    }

    const authReq = request as AuthenticatedRequest;
    const { referenceDate } = ScanTriggerSchema.parse(request.body ?? {});

    const result = await DeadlineScannerService.runScan(
      authReq.session!.organizationId,
      referenceDate,
    );

    return reply.status(200).send(result);
  });
}
