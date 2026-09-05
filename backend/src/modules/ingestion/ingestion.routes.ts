import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PresignUploadRequestSchema, ConfirmExtractionRequestSchema } from '@renewalradar/shared';
import { IngestionService } from './ingestion.service.js';
import { AuthenticatedRequest } from '../../server.js';
import { z } from 'zod';

const StagingParamsSchema = z.object({
  id: z.string(),
});

export async function ingestionRoutes(server: FastifyInstance): Promise<void> {
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

  // POST /api/v1/ingestion/upload-url - Generate presigned upload URL
  server.post('/upload-url', async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const input = PresignUploadRequestSchema.parse(request.body);

    const result = await IngestionService.requestUploadUrl(
      authReq.session!.organizationId,
      input.filename,
      input.fileSizeBytes,
      input.mimeType,
    );

    return reply.status(200).send(result);
  });

  // GET /api/v1/ingestion/staging/:id - Fetch staged extraction for human review
  server.get('/staging/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = StagingParamsSchema.parse(request.params);

    const staged = await IngestionService.getStagedExtraction(authReq.session!.organizationId, id);

    if (!staged) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Staged extraction not found',
      });
    }

    return staged;
  });

  // POST /api/v1/ingestion/confirm - Confirm staged extraction into active obligation
  server.post('/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    const input = ConfirmExtractionRequestSchema.parse(request.body);

    try {
      const obligation = await IngestionService.confirmExtraction(
        authReq.tenant!,
        input.stagingId,
        input.confirmedData,
        authReq.session?.userId,
      );

      return reply.status(201).send(obligation);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Confirmation failed';
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message,
      });
    }
  });
}
