import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { resetTestDatabase, testDb } from '../helpers/test-database.js';
import * as schema from '../../src/db/schema/index.js';

// Wire real PGlite test database to client.js
vi.mock('../../src/db/client.js', async () => {
  const { testDb } = await import('../helpers/test-database.js');
  return { db: testDb };
});

import { buildServer } from '../../src/server.js';
import { SessionService } from '../../src/modules/auth/session.service.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { IngestionRepository } from '../../src/modules/ingestion/ingestion.repository.js';
import type { ConfirmExtractionRequest } from '@renewalradar/shared';

describe('Document Ingestion API Contract Tests (User Story 5 & FR-014-FR-018)', () => {
  let app: FastifyInstance;

  const orgId = '88888888-8888-4888-8888-888888888888';
  const otherOrgId = '99999999-9999-4999-9999-999999999999';
  const userId = '11111111-1111-4111-8111-111111111111';
  const viewerUserId = '22222222-2222-4222-8222-222222222222';

  let adminCookie: string;
  let viewerCookie: string;
  let otherOrgCookie: string;

  // In-memory fake S3 storage buffer store for test boundary
  const fakeStorage = new Map<string, Buffer>();
  const enqueuedJobs: Array<{
    jobName: string;
    data: { documentId: string; organizationId: string };
  }> = [];

  beforeAll(async () => {
    // Session cookies
    adminCookie = `rr_session=${SessionService.encryptSession({
      userId,
      organizationId: orgId,
      role: 'admin',
      email: 'admin@acme.corp',
      createdAt: Date.now(),
    })}`;

    viewerCookie = `rr_session=${SessionService.encryptSession({
      userId: viewerUserId,
      organizationId: orgId,
      role: 'viewer',
      email: 'viewer@acme.corp',
      createdAt: Date.now(),
    })}`;

    otherOrgCookie = `rr_session=${SessionService.encryptSession({
      userId: crypto.randomUUID(),
      organizationId: otherOrgId,
      role: 'admin',
      email: 'admin@beta.corp',
      createdAt: Date.now(),
    })}`;

    // Inject storage and queue boundaries into IngestionService
    IngestionService.setDependencies({
      storage: {
        async getObject(storagePath: string) {
          return fakeStorage.get(storagePath) || Buffer.alloc(0);
        },
        async generatePresignedUploadUrl(organizationId, documentId, filename, mimeType) {
          const storagePath = `documents/${organizationId}/${documentId}/${filename}`;
          return {
            uploadUrl: `https://renewalradar-documents.s3.amazonaws.com/${storagePath}?signed=true`,
            storagePath,
            expiresInSeconds: 300,
          };
        },
        async generatePresignedDownloadUrl(options) {
          return {
            downloadUrl: `https://renewalradar-documents.s3.amazonaws.com/${options.storagePath}?preview=true`,
            expiresInSeconds: options.expiresInSeconds ?? 300,
          };
        },
      },
      queue: {
        async add(jobName, data) {
          enqueuedJobs.push({ jobName, data });
          return { id: 'job-1' };
        },
      },
    });

    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    IngestionService.resetDependencies();
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    fakeStorage.clear();
    enqueuedJobs.length = 0;

    // Seed test organizations
    await testDb.insert(schema.organizations).values([
      { id: orgId, name: 'Acme Corp', slug: 'acme-corp', defaultCurrency: 'USD', tier: 'business' },
      { id: otherOrgId, name: 'Beta LLC', slug: 'beta-llc', defaultCurrency: 'USD', tier: 'free' },
    ]);

    // Seed test users
    await testDb.insert(schema.users).values([
      { id: userId, email: 'admin@acme.corp', fullName: 'Admin User', passwordHash: 'mock' },
      {
        id: viewerUserId,
        email: 'viewer@acme.corp',
        fullName: 'Viewer User',
        passwordHash: 'mock',
      },
    ]);

    // Seed memberships
    await testDb.insert(schema.organizationMembers).values([
      { organizationId: orgId, userId, role: 'admin' },
      { organizationId: orgId, userId: viewerUserId, role: 'viewer' },
    ]);
  });

  it('POST /api/v1/ingestion/upload-url generates presigned upload result and persists upload_pending row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/upload-url',
      headers: { cookie: adminCookie },
      payload: {
        filename: 'vendor-agreement-2026.pdf',
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.documentId).toBeDefined();
    expect(body.uploadUrl).toContain('renewalradar-documents');
    expect(body.storagePath).toContain(orgId);
    expect(body.expiresInSeconds).toBe(300);

    // Verify DB persistence
    const [persistedDoc] = await testDb
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, body.documentId));
    expect(persistedDoc).toBeDefined();
    expect(persistedDoc?.processingStatus).toBe('upload_pending');
    expect(persistedDoc?.organizationId).toBe(orgId);
  });

  it('POST /api/v1/ingestion/upload-url rejects disallowed MIME types with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/upload-url',
      headers: { cookie: adminCookie },
      payload: {
        filename: 'malicious.exe',
        fileSizeBytes: 1024,
        mimeType: 'application/x-msdownload',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/ingestion/documents/:documentId/finalize validates magic bytes and enqueues job', async () => {
    const validPdfBuffer = Buffer.from('%PDF-1.4\n12', 'utf-8');
    // 1. Request upload URL
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/upload-url',
      headers: { cookie: adminCookie },
      payload: {
        filename: 'contract.pdf',
        fileSizeBytes: validPdfBuffer.length,
        mimeType: 'application/pdf',
      },
    });
    const { documentId, storagePath } = JSON.parse(uploadRes.body);

    // 2. Put real PDF magic-byte buffer into storage boundary (%PDF-1.4\n)
    fakeStorage.set(storagePath, validPdfBuffer);

    // 3. Finalize upload
    const finalizeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ingestion/documents/${documentId}/finalize`,
      headers: { cookie: adminCookie },
    });

    expect(finalizeRes.statusCode).toBe(200);
    const statusBody = JSON.parse(finalizeRes.body);
    expect(statusBody.documentId).toBe(documentId);
    expect(statusBody.processingStatus).toBe('uploaded');
    expect(statusBody.securityStatus).toBe('clean');

    // Verify queue received job
    expect(enqueuedJobs.length).toBe(1);
    expect(enqueuedJobs[0]?.data).toEqual({
      documentId,
      organizationId: orgId,
    });
  });

  it('GET /api/v1/ingestion/documents/:documentId returns status and staging details', async () => {
    const documentId = crypto.randomUUID();
    await IngestionRepository.createDocument({
      id: documentId,
      organizationId: orgId,
      originalFilename: 'test.pdf',
      sanitizedFilename: 'test.pdf',
      declaredMimeType: 'application/pdf',
      fileSizeBytes: 100,
      storagePath: `documents/${orgId}/${documentId}/test.pdf`,
      processingStatus: 'pending_review',
      securityStatus: 'clean',
      uploadedBy: userId,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/ingestion/documents/${documentId}`,
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.documentId).toBe(documentId);
    expect(body.processingStatus).toBe('pending_review');
  });

  it('POST /api/v1/ingestion/confirm confirms staged extraction into an active obligation via real PGlite', async () => {
    const documentId = crypto.randomUUID();
    const stagingId = crypto.randomUUID();

    // Persist document
    await IngestionRepository.createDocument({
      id: documentId,
      organizationId: orgId,
      originalFilename: 'zendesk_contract.pdf',
      sanitizedFilename: 'zendesk_contract.pdf',
      declaredMimeType: 'application/pdf',
      fileSizeBytes: 50000,
      storagePath: `documents/${orgId}/${documentId}/zendesk_contract.pdf`,
      processingStatus: 'pending_review',
      securityStatus: 'clean',
      uploadedBy: userId,
    });

    // Persist staging in PGlite
    await IngestionRepository.createStaging({
      id: stagingId,
      documentId,
      organizationId: orgId,
      status: 'pending_review',
      overallConfidence: 0.95,
      extractedFields: [
        {
          fieldName: 'title',
          extractedValue: 'Zendesk Suite Support',
          confidence: 0.95,
          requiresReview: false,
        },
        {
          fieldName: 'amount',
          extractedValue: 3000,
          confidence: 0.9,
          requiresReview: false,
        },
      ],
    });

    const confirmationPayload: ConfirmExtractionRequest = {
      stagingId,
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
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/confirm',
      headers: { cookie: adminCookie },
      payload: confirmationPayload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.title).toBe('Zendesk Suite Support');
    expect(body.status).toBe('active');
    expect(body.amount).toBe('3600');

    // Verify DB state
    const [persistedObligation] = await testDb
      .select()
      .from(schema.obligations)
      .where(eq(schema.obligations.id, body.id));
    expect(persistedObligation).toBeDefined();
    expect(persistedObligation?.organizationId).toBe(orgId);

    // Verify audit event
    const [audit] = await testDb
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, 'confirmed'));
    expect(audit).toBeDefined();
    expect(audit?.entityId).toBe(documentId);
  });

  it('POST /api/v1/ingestion/staging/:stagingId/reject rejects staging without creating obligation', async () => {
    const documentId = crypto.randomUUID();
    const stagingId = crypto.randomUUID();

    await IngestionRepository.createDocument({
      id: documentId,
      organizationId: orgId,
      originalFilename: 'spam.pdf',
      sanitizedFilename: 'spam.pdf',
      declaredMimeType: 'application/pdf',
      fileSizeBytes: 1000,
      storagePath: `documents/${orgId}/${documentId}/spam.pdf`,
      processingStatus: 'pending_review',
      securityStatus: 'clean',
      uploadedBy: userId,
    });

    await IngestionRepository.createStaging({
      id: stagingId,
      documentId,
      organizationId: orgId,
      status: 'pending_review',
      overallConfidence: 0.5,
      extractedFields: [],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/ingestion/staging/${stagingId}/reject`,
      headers: { cookie: adminCookie },
      payload: { reason: 'Not a relevant contract' },
    });

    expect(res.statusCode).toBe(200);

    const [staging] = await testDb
      .select()
      .from(schema.extractionStagings)
      .where(eq(schema.extractionStagings.id, stagingId));
    expect(staging?.status).toBe('rejected');

    const obligations = await testDb.select().from(schema.obligations);
    expect(obligations.length).toBe(0);
  });

  it('denies Viewer role on mutative endpoints with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/upload-url',
      headers: { cookie: viewerCookie },
      payload: {
        filename: 'contract.pdf',
        fileSizeBytes: 1000,
        mimeType: 'application/pdf',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('enforces cross-tenant isolation with 404', async () => {
    const stagingId = crypto.randomUUID();
    const documentId = crypto.randomUUID();

    await IngestionRepository.createDocument({
      id: documentId,
      organizationId: orgId,
      originalFilename: 'orgA_doc.pdf',
      sanitizedFilename: 'orgA_doc.pdf',
      declaredMimeType: 'application/pdf',
      fileSizeBytes: 1000,
      storagePath: `documents/${orgId}/${documentId}/orgA_doc.pdf`,
      processingStatus: 'pending_review',
      securityStatus: 'clean',
      uploadedBy: userId,
    });

    await IngestionRepository.createStaging({
      id: stagingId,
      documentId,
      organizationId: orgId,
      status: 'pending_review',
      overallConfidence: 0.9,
      extractedFields: [],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/ingestion/staging/${stagingId}`,
      headers: { cookie: otherOrgCookie },
    });

    expect(res.statusCode).toBe(404);
  });
});
