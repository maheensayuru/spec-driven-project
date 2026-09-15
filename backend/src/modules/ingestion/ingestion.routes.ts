import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  PresignUploadRequestSchema,
  ConfirmExtractionRequestSchema,
  RejectExtractionRequestSchema,
} from '@renewalradar/shared';
import { IngestionService } from './ingestion.service.js';
import { IngestionDomainError } from './ingestion.repository.js';
import { AuthenticatedRequest } from '../../server.js';
import { requirePermission } from '../auth/rbac.service.js';
import { z } from 'zod';

const DocumentParamsSchema = z.object({
  documentId: z.string().uuid(),
});

const StagingParamsSchema = z.object({
  stagingId: z.string().uuid(),
});

function handleIngestionError(err: unknown, reply: FastifyReply) {
  if (err instanceof IngestionDomainError) {
    return reply.status(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.name,
      message: err.message,
    });
  }

  const message = err instanceof Error ? err.message : 'Operation failed';
  return reply.status(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message,
  });
}

export async function ingestionRoutes(server: FastifyInstance): Promise<void> {
  // Authentication Guard Middleware for all ingestion endpoints
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
  server.post(
    '/upload-url',
    { preHandler: [requirePermission('obligations:create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authReq = request as AuthenticatedRequest;
      const input = PresignUploadRequestSchema.parse(request.body);

      try {
        const result = await IngestionService.requestUploadUrl(
          authReq.session!.organizationId,
          authReq.session!.userId,
          input.filename,
          input.fileSizeBytes,
          input.mimeType,
        );

        return reply.status(200).send(result);
      } catch (err: unknown) {
        return handleIngestionError(err, reply);
      }
    },
  );

  // POST /api/v1/ingestion/documents/:documentId/finalize - Finalize document upload and queue extraction
  server.post(
    '/documents/:documentId/finalize',
    { preHandler: [requirePermission('obligations:create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authReq = request as AuthenticatedRequest;
      const { documentId } = DocumentParamsSchema.parse(request.params);

      try {
        const status = await IngestionService.finalizeDocument(
          authReq.session!.organizationId,
          documentId,
        );

        return reply.status(200).send(status);
      } catch (err: unknown) {
        return handleIngestionError(err, reply);
      }
    },
  );

  // GET /api/v1/ingestion/documents/:documentId - Get document processing & security status
  server.get(
    '/documents/:documentId',
    { preHandler: [requirePermission('obligations:read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authReq = request as AuthenticatedRequest;
      const { documentId } = DocumentParamsSchema.parse(request.params);

      try {
        const status = await IngestionService.getDocumentStatus(
          authReq.session!.organizationId,
          documentId,
        );

        return reply.status(200).send(status);
      } catch (err: unknown) {
        return handleIngestionError(err, reply);
      }
    },
  );

  // GET /api/v1/ingestion/staging/:stagingId - Fetch staged extraction for human review
  server.get(
    '/staging/:stagingId',
    { preHandler: [requirePermission('obligations:read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authReq = request as AuthenticatedRequest;
      const { stagingId } = StagingParamsSchema.parse(request.params);

      try {
        const staged = await IngestionService.getStagedExtraction(
          authReq.session!.organizationId,
          stagingId,
        );

        return reply.status(200).send(staged);
      } catch (err: unknown) {
        return handleIngestionError(err, reply);
      }
    },
  );

  // POST /api/v1/ingestion/confirm - Confirm staged extraction into active obligation
  server.post(
    '/confirm',
    { preHandler: [requirePermission('obligations:create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
        return handleIngestionError(err, reply);
      }
    },
  );

  // POST /api/v1/ingestion/staging/:stagingId/reject - Reject staged extraction
  server.post(
    '/staging/:stagingId/reject',
    { preHandler: [requirePermission('obligations:create')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authReq = request as AuthenticatedRequest;
      const { stagingId } = StagingParamsSchema.parse(request.params);
      const input = RejectExtractionRequestSchema.parse(request.body);

      try {
        const result = await IngestionService.rejectExtraction(
          authReq.tenant!,
          stagingId,
          input.reason,
          authReq.session?.userId,
        );

        return reply.status(200).send(result);
      } catch (err: unknown) {
        return handleIngestionError(err, reply);
      }
    },
  );
}
