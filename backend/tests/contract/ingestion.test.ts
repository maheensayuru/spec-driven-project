import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';
import { FastifyInstance } from 'fastify';
import { SessionService } from '../../src/modules/auth/session.service.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';

describe('Document Ingestion API Contract Tests (User Story 5 & FR-014-FR-018)', () => {
  let app: FastifyInstance;
  const orgId = '88888888-8888-8888-8888-888888888888';
  let sessionCookie: string;

  beforeAll(async () => {
    const token = SessionService.encryptSession({
      userId: 'user-ingest-1',
      organizationId: orgId,
      role: 'admin',
      email: 'ops@acme.corp',
      createdAt: Date.now(),
    });
    sessionCookie = `rr_session=${token}`;

    app = buildServer({
      tenantContextFactory: (organizationId: string) => ({
        organizationId,
        obligations: {
          async findById() {
            return null;
          },
          async list() {
            return [];
          },
          async create(data) {
            return {
              id: 'obl-confirmed-1',
              organizationId,
              vendorId: null,
              title: data.title,
              type: data.type,
              status: 'active',
              amount: data.amount,
              currency: data.currency,
              billingFrequency: data.billingFrequency,
              startDate: data.startDate ?? null,
              renewalDate: data.renewalDate,
              expirationDate: data.expirationDate ?? null,
              noticePeriodDays: data.noticePeriodDays,
              cancellationDeadline: data.cancellationDeadline,
              autoRenew: data.autoRenew,
              tags: (data.tags as unknown[]) ?? [],
              internalOwnerId: null,
              notes: data.notes ?? null,
              version: 1,
              deletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
          async update() {
            return null;
          },
          async softDelete() {
            return null;
          },
        },
        audit: {
          async record() {
            return {
              id: 'mock-audit',
              organizationId,
              actorId: null,
              entityType: 'document',
              entityId: 'doc-1',
              action: 'confirmed',
              beforeState: null,
              afterState: null,
              ipAddress: null,
              userAgent: null,
              createdAt: new Date(),
            };
          },
        },
      }),
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/ingestion/upload-url generates presigned upload result for PDF', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/upload-url',
      headers: { cookie: sessionCookie },
      payload: {
        filename: 'vendor-agreement-2026.pdf',
        fileSizeBytes: 1048576, // 1MB
        mimeType: 'application/pdf',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.documentId).toBeDefined();
    expect(body.uploadUrl).toContain('renewalradar-documents');
    expect(body.storagePath).toContain(orgId);
    expect(body.expiresInSeconds).toBe(300);
  });

  it('POST /api/v1/ingestion/upload-url rejects disallowed MIME types with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/upload-url',
      headers: { cookie: sessionCookie },
      payload: {
        filename: 'malicious.exe',
        fileSizeBytes: 1024,
        mimeType: 'application/x-msdownload', // not in allowlist
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/ingestion/confirm confirms staged extraction into an active obligation', async () => {
    // Seed staging record
    const stagingUuid = '99999999-9999-9999-9999-999999999999';
    IngestionService.registerStagingMock({
      stagingId: stagingUuid,
      documentId: 'doc-test-1',
      organizationId: orgId,
      status: 'pending_review',
      overallConfidence: 0.9,
      fields: [],
      suggestedType: 'contract',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/confirm',
      headers: { cookie: sessionCookie },
      payload: {
        stagingId: stagingUuid,
        confirmedData: {
          title: 'Zendesk Suite Support',
          type: 'subscription',
          vendorName: 'Zendesk, Inc.',
          amount: 3600,
          currency: 'USD',
          billingFrequency: 'annual',
          renewalDate: '2026-11-30',
          noticePeriodDays: 30,
          autoRenew: true,
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.title).toBe('Zendesk Suite Support');
    expect(body.status).toBe('active');
    expect(body.amount).toBe('3600');
  });
});
