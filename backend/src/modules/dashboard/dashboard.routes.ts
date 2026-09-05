import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from './dashboard.service.js';
import { AuthenticatedRequest } from '../../server.js';

export async function dashboardRoutes(server: FastifyInstance): Promise<void> {
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

  // GET /api/v1/dashboard - Executive Summary Metrics
  server.get('/', async (request: FastifyRequest) => {
    const authReq = request as AuthenticatedRequest;
    const reportingCurrency = 'USD'; // default reporting currency

    const metrics = await DashboardService.aggregateDashboard(authReq.tenant!, reportingCurrency);

    return metrics;
  });
}
