import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { resetTestDatabase, testDb, testClient } from '../../helpers/test-database.js';
import * as schema from '../../../src/db/schema/index.js';

// The mock factory is hoisted by Vitest; importing inside the callback avoids TDZ access.
vi.mock('../../../src/db/client.js', async () => {
  const { testDb } = await import('../../helpers/test-database.js');
  return { db: testDb };
});

import { buildServer } from '../../../src/server.js';
import { SessionService } from '../../../src/modules/auth/session.service.js';
import { processDocumentExtractionJob } from '../../../src/queue/workers/document-extractor.worker.js';
import type { ExtractedFieldItem, ConfirmExtractionRequest } from '@renewalradar/shared';

// Canonical document schema shape expected across US5 workflows (Task T048)
interface CanonicalDocumentInsertData {
  id: string;
  organizationId: string;
  originalFilename: string;
  sanitizedFilename: string;
  declaredMimeType: string;
  detectedMimeType: string;
  securityStatus: string;
  fileSizeBytes: number;
  fileHashSha256: string;
  storagePath: string;
  processingStatus: string;
  uploadedBy: string;
}

describe('T047: Document Extraction & Human Verification Workflow Integration (US5)', () => {
  let app: FastifyInstance;

  // Deterministic fixtures
  const orgA = '11111111-1111-4111-8111-111111111111';
  const orgB = '22222222-2222-4222-8222-222222222222';

  const userAdminAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userViewerAId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const userAdminBId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  let orgAAdminCookie: string;
  let orgAViewerCookie: string;
  let orgBAdminCookie: string;

  beforeAll(async () => {
    // Generate session cookies for actors
    const tokenAdminA = SessionService.encryptSession({
      userId: userAdminAId,
      organizationId: orgA,
      role: 'admin',
      email: 'admin@acme.com',
      createdAt: Date.now(),
    });
    orgAAdminCookie = `rr_session=${tokenAdminA}`;

    const tokenViewerA = SessionService.encryptSession({
      userId: userViewerAId,
      organizationId: orgA,
      role: 'viewer',
      email: 'viewer@acme.com',
      createdAt: Date.now(),
    });
    orgAViewerCookie = `rr_session=${tokenViewerA}`;

    const tokenAdminB = SessionService.encryptSession({
      userId: userAdminBId,
      organizationId: orgB,
      role: 'admin',
      email: 'admin@beta.com',
      createdAt: Date.now(),
    });
    orgBAdminCookie = `rr_session=${tokenAdminB}`;

    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();

    // Seed organizations
    await testDb.insert(schema.organizations).values([
      { id: orgA, name: 'Acme Corp', slug: 'acme-corp', defaultCurrency: 'USD', tier: 'business' },
      { id: orgB, name: 'Beta LLC', slug: 'beta-llc', defaultCurrency: 'USD', tier: 'free' },
    ]);

    // Seed users
    await testDb.insert(schema.users).values([
      {
        id: userAdminAId,
        email: 'admin@acme.com',
        fullName: 'Admin Acme',
        passwordHash: 'argon2id$mock',
      },
      {
        id: userViewerAId,
        email: 'viewer@acme.com',
        fullName: 'Viewer Acme',
        passwordHash: 'argon2id$mock',
      },
      {
        id: userAdminBId,
        email: 'admin@beta.com',
        fullName: 'Admin Beta',
        passwordHash: 'argon2id$mock',
      },
    ]);

    // Seed memberships
    await testDb.insert(schema.organizationMembers).values([
      { organizationId: orgA, userId: userAdminAId, role: 'admin' },
      { organizationId: orgA, userId: userViewerAId, role: 'viewer' },
      { organizationId: orgB, userId: userAdminBId, role: 'admin' },
    ]);
  });

  it('progresses through uploaded -> processing -> pending_review -> confirmed with DB persistence', async () => {
    const documentId = crypto.randomUUID();

    // 1. Initial State: Document uploaded using canonical schema properties
    const uploadDoc: CanonicalDocumentInsertData = {
      id: documentId,
      organizationId: orgA,
      originalFilename: 'salesforce_contract_2026.pdf',
      sanitizedFilename: 'salesforce_contract_2026.pdf',
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      securityStatus: 'clean',
      fileSizeBytes: 1048576,
      fileHashSha256: 'a'.repeat(64),
      storagePath: `documents/${orgA}/${documentId}/salesforce_contract_2026.pdf`,
      processingStatus: 'uploaded',
      uploadedBy: userAdminAId,
    };
    await testDb
      .insert(schema.documents)
      .values(uploadDoc as unknown as typeof schema.documents.$inferInsert);

    // 2. Worker processes document extraction with job data { documentId, organizationId }
    // worker owns staging UUID generation and uses deterministic textExtractor without contacting S3
    const mockExtractionFields: ExtractedFieldItem[] = [
      {
        fieldName: 'title',
        extractedValue: 'Salesforce Enterprise CRM',
        confidence: 0.95,
        sourcePage: 1,
        sourceSnippet: 'Salesforce Enterprise Agreement',
        requiresReview: false,
      },
      {
        fieldName: 'type',
        extractedValue: 'subscription',
        confidence: 0.92,
        requiresReview: false,
      },
      {
        fieldName: 'vendorName',
        extractedValue: 'Salesforce.com, inc.',
        confidence: 0.91,
        requiresReview: false,
      },
      {
        fieldName: 'amount',
        extractedValue: 24000,
        confidence: 0.9,
        requiresReview: false,
      },
      {
        fieldName: 'renewalDate',
        extractedValue: '2027-02-01',
        confidence: 0.88,
        requiresReview: false,
      },
      {
        fieldName: 'noticePeriodDays',
        extractedValue: 60,
        confidence: 0.76, // Below 0.85, requires review
        requiresReview: true,
      },
    ];

    await processDocumentExtractionJob(
      {
        documentId,
        organizationId: orgA,
      },
      {
        textExtractor: {
          async extractText() {
            return 'Salesforce Enterprise CRM Agreement between Acme Corp and Salesforce.com, inc. Annual fee $24,000 renewing 2027-02-01 with 60 days notice.';
          },
        },
        extractionProvider: {
          async extract() {
            return {
              fields: mockExtractionFields,
              overallConfidence: 0.89,
              providerMetadata: {
                provider: 'mock' as const,
                model: 'mock-model',
                durationMs: 250,
              },
            };
          },
        },
      },
    );

    // Verify document transitioned to pending_review
    const [docInReview] = await testDb
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    expect(docInReview?.processingStatus).toBe('pending_review');

    // Query staging record by documentId (worker-owned staging UUID)
    const [stagingRow] = await testDb
      .select()
      .from(schema.extractionStagings)
      .where(eq(schema.extractionStagings.documentId, documentId));
    expect(stagingRow).toBeDefined();
    expect(stagingRow?.status).toBe('pending_review');
    expect(stagingRow?.overallConfidence).toBeCloseTo(0.89);
    const stagingId = stagingRow!.id;

    // 3. Reviewer retrieves staging detail via GET /api/v1/ingestion/staging/:id
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/ingestion/staging/${stagingId}`,
      headers: { cookie: orgAAdminCookie },
    });
    expect(getRes.statusCode).toBe(200);
    const stagingDetail = JSON.parse(getRes.body);
    expect(stagingDetail.status).toBe('pending_review');
    expect(
      stagingDetail.fields.find((f: ExtractedFieldItem) => f.fieldName === 'noticePeriodDays')
        ?.requiresReview,
    ).toBe(true);

    // 4. Reviewer confirms extraction with corrected amount and notice period via POST /api/v1/ingestion/confirm
    const confirmationPayload: ConfirmExtractionRequest = {
      stagingId,
      confirmedData: {
        title: 'Salesforce Enterprise CRM',
        type: 'subscription',
        vendorName: 'Salesforce.com, inc.',
        amount: 25500, // Corrected from 24000
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2027-02-01',
        noticePeriodDays: 60,
        autoRenew: true,
        notes: 'Confirmed by Admin with updated tier pricing',
      },
    };

    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/confirm',
      headers: { cookie: orgAAdminCookie },
      payload: confirmationPayload,
    });
    expect(confirmRes.statusCode).toBe(201);
    const createdObligation = JSON.parse(confirmRes.body);
    expect(createdObligation.id).toBeDefined();
    expect(createdObligation.status).toBe('active');
    expect(createdObligation.amount).toBe('25500');

    // 5. Verify database invariants:
    // a. Staging record marked confirmed with reviewer and timestamp
    const [confirmedStaging] = await testDb
      .select()
      .from(schema.extractionStagings)
      .where(eq(schema.extractionStagings.id, stagingId));
    expect(confirmedStaging?.status).toBe('confirmed');
    expect(confirmedStaging?.reviewedBy).toBe(userAdminAId);
    expect(confirmedStaging?.reviewedAt).not.toBeNull();

    // b. Staging extractedFields retains original immutable extractedValue alongside correctedValue
    const fieldsAfterConfirm = confirmedStaging?.extractedFields as ExtractedFieldItem[];
    const amountField = fieldsAfterConfirm.find((f) => f.fieldName === 'amount');
    expect(amountField?.extractedValue).toBe(24000); // Immutable original AI value
    expect(amountField?.correctedValue).toBe(25500); // Human correction
    expect(amountField?.correctedBy).toBe(userAdminAId);
    expect(amountField?.correctedAt).toBeDefined();

    // c. Document linked to obligation and status updated
    const [confirmedDoc] = await testDb
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    expect(confirmedDoc?.processingStatus).toBe('confirmed');
    expect(confirmedDoc?.obligationId).toBe(createdObligation.id);

    // d. Obligation persisted in obligations table
    const [persistedObligation] = await testDb
      .select()
      .from(schema.obligations)
      .where(eq(schema.obligations.id, createdObligation.id));
    expect(persistedObligation).toBeDefined();
    expect(persistedObligation?.organizationId).toBe(orgA);
    expect(persistedObligation?.amount).toBe('25500.00');

    // e. Audit event emitted
    const auditLogs = await testDb
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.organizationId, orgA),
          eq(schema.auditEvents.action, 'confirmed'),
        ),
      );
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs[0]?.actorId).toBe(userAdminAId);
    expect(auditLogs[0]?.entityType).toBe('document');
    expect(auditLogs[0]?.entityId).toBe(documentId);
  });

  it('handles human rejection via POST /api/v1/ingestion/staging/:id/reject without creating obligation', async () => {
    const documentId = crypto.randomUUID();
    const stagingId = crypto.randomUUID();

    // Seed document and staging in pending_review using canonical properties
    const rejectDoc: CanonicalDocumentInsertData = {
      id: documentId,
      organizationId: orgA,
      originalFilename: 'spam_brochure.pdf',
      sanitizedFilename: 'spam_brochure.pdf',
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      securityStatus: 'clean',
      fileSizeBytes: 50000,
      fileHashSha256: 'b'.repeat(64),
      storagePath: `documents/${orgA}/${documentId}/spam_brochure.pdf`,
      processingStatus: 'pending_review',
      uploadedBy: userAdminAId,
    };
    await testDb
      .insert(schema.documents)
      .values(rejectDoc as unknown as typeof schema.documents.$inferInsert);

    await testDb.insert(schema.extractionStagings).values({
      id: stagingId,
      documentId,
      organizationId: orgA,
      status: 'pending_review',
      overallConfidence: 0.45,
      extractedFields: [],
    });

    // Reject the extraction
    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ingestion/staging/${stagingId}/reject`,
      headers: { cookie: orgAAdminCookie },
      payload: { reason: 'Uploaded file is a marketing brochure, not a binding contract.' },
    });
    expect(rejectRes.statusCode).toBe(200);

    // Verify database state:
    // Staging status is 'rejected'
    const [staging] = await testDb
      .select()
      .from(schema.extractionStagings)
      .where(eq(schema.extractionStagings.id, stagingId));
    expect(staging?.status).toBe('rejected');
    expect(staging?.reviewedBy).toBe(userAdminAId);
    expect(staging?.reviewedAt).not.toBeNull();

    // Document status is 'rejected', no obligation linked
    const [doc] = await testDb
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    expect(doc?.processingStatus).toBe('rejected');
    expect(doc?.obligationId).toBeNull();

    // No obligation created
    const obligations = await testDb
      .select()
      .from(schema.obligations)
      .where(eq(schema.obligations.organizationId, orgA));
    expect(obligations.length).toBe(0);

    // Audit event recorded
    const auditLogs = await testDb
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.organizationId, orgA),
          eq(schema.auditEvents.action, 'rejected'),
        ),
      );
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs[0]?.actorId).toBe(userAdminAId);
  });

  it('records extraction_failed when document processing fails', async () => {
    const documentId = crypto.randomUUID();

    const failingDoc: CanonicalDocumentInsertData = {
      id: documentId,
      organizationId: orgA,
      originalFilename: 'corrupted_or_encrypted.pdf',
      sanitizedFilename: 'corrupted_or_encrypted.pdf',
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      securityStatus: 'clean',
      fileSizeBytes: 20000,
      fileHashSha256: 'c'.repeat(64),
      storagePath: `documents/${orgA}/${documentId}/corrupted_or_encrypted.pdf`,
      processingStatus: 'uploaded',
      uploadedBy: userAdminAId,
    };
    await testDb
      .insert(schema.documents)
      .values(failingDoc as unknown as typeof schema.documents.$inferInsert);

    // Processor fails extraction
    await expect(
      processDocumentExtractionJob(
        { documentId, organizationId: orgA },
        {
          textExtractor: {
            async extractText() {
              throw new Error('File is password-protected or unreadable PDF');
            },
          },
        },
      ),
    ).rejects.toThrow();

    // Document transitioned to extraction_failed
    const [doc] = await testDb
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    expect(doc?.processingStatus).toBe('extraction_failed');

    // Staging record reflects failure if created
    const [staging] = await testDb
      .select()
      .from(schema.extractionStagings)
      .where(eq(schema.extractionStagings.documentId, documentId));
    if (staging) {
      expect(staging.status).toBe('failed');
    }
  });

  it('enforces tenant isolation with 404 on cross-tenant staging access and mutations', async () => {
    const documentId = crypto.randomUUID();
    const stagingId = crypto.randomUUID();

    // Seed record belonging to Org A
    const orgADoc: CanonicalDocumentInsertData = {
      id: documentId,
      organizationId: orgA,
      originalFilename: 'acme_confidential.pdf',
      sanitizedFilename: 'acme_confidential.pdf',
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      securityStatus: 'clean',
      fileSizeBytes: 50000,
      fileHashSha256: 'd'.repeat(64),
      storagePath: `documents/${orgA}/${documentId}/acme_confidential.pdf`,
      processingStatus: 'pending_review',
      uploadedBy: userAdminAId,
    };
    await testDb
      .insert(schema.documents)
      .values(orgADoc as unknown as typeof schema.documents.$inferInsert);

    await testDb.insert(schema.extractionStagings).values({
      id: stagingId,
      documentId,
      organizationId: orgA,
      status: 'pending_review',
      overallConfidence: 0.9,
      extractedFields: [],
    });

    // Org B attempts to read Org A staging detail -> 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/ingestion/staging/${stagingId}`,
      headers: { cookie: orgBAdminCookie },
    });
    expect(getRes.statusCode).toBe(404);

    // Org B attempts to confirm Org A staging -> 404
    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/confirm',
      headers: { cookie: orgBAdminCookie },
      payload: {
        stagingId,
        confirmedData: {
          title: 'Cross-Tenant Attack',
          type: 'subscription',
          vendorName: 'Attacker Corp',
          amount: 100,
          currency: 'USD',
          billingFrequency: 'monthly',
          renewalDate: '2026-12-31',
          noticePeriodDays: 30,
          autoRenew: true,
        },
      },
    });
    expect(confirmRes.statusCode).toBe(404);

    // Org B attempts to reject Org A staging -> 404
    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ingestion/staging/${stagingId}/reject`,
      headers: { cookie: orgBAdminCookie },
      payload: { reason: 'Unauthorized rejection attempt' },
    });
    expect(rejectRes.statusCode).toBe(404);
  });

  it('rejects mutative requests from Viewer role with 403 Forbidden', async () => {
    const documentId = crypto.randomUUID();
    const stagingId = crypto.randomUUID();

    const viewerDoc: CanonicalDocumentInsertData = {
      id: documentId,
      organizationId: orgA,
      originalFilename: 'contract_view_only.pdf',
      sanitizedFilename: 'contract_view_only.pdf',
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      securityStatus: 'clean',
      fileSizeBytes: 50000,
      fileHashSha256: 'e'.repeat(64),
      storagePath: `documents/${orgA}/${documentId}/contract_view_only.pdf`,
      processingStatus: 'pending_review',
      uploadedBy: userAdminAId,
    };
    await testDb
      .insert(schema.documents)
      .values(viewerDoc as unknown as typeof schema.documents.$inferInsert);

    await testDb.insert(schema.extractionStagings).values({
      id: stagingId,
      documentId,
      organizationId: orgA,
      status: 'pending_review',
      overallConfidence: 0.9,
      extractedFields: [],
    });

    // Viewer CAN read staging detail (200 OK)
    const readRes = await app.inject({
      method: 'GET',
      url: `/api/v1/ingestion/staging/${stagingId}`,
      headers: { cookie: orgAViewerCookie },
    });
    expect(readRes.statusCode).toBe(200);

    // Viewer CANNOT confirm (403 Forbidden)
    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/confirm',
      headers: { cookie: orgAViewerCookie },
      payload: {
        stagingId,
        confirmedData: {
          title: 'Viewer Attempt',
          type: 'contract',
          vendorName: 'Vendor',
          amount: 1000,
          currency: 'USD',
          billingFrequency: 'annual',
          renewalDate: '2027-01-01',
          noticePeriodDays: 30,
          autoRenew: false,
        },
      },
    });
    expect(confirmRes.statusCode).toBe(403);

    // Viewer CANNOT reject (403 Forbidden)
    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ingestion/staging/${stagingId}/reject`,
      headers: { cookie: orgAViewerCookie },
      payload: { reason: 'Viewer rejection attempt' },
    });
    expect(rejectRes.statusCode).toBe(403);
  });

  it('handles concurrent/duplicate confirmation with only one success and blocks stale staging', async () => {
    const documentId = crypto.randomUUID();
    const stagingId = crypto.randomUUID();

    const concurrentDoc: CanonicalDocumentInsertData = {
      id: documentId,
      organizationId: orgA,
      originalFilename: 'concurrent_test.pdf',
      sanitizedFilename: 'concurrent_test.pdf',
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      securityStatus: 'clean',
      fileSizeBytes: 50000,
      fileHashSha256: 'f'.repeat(64),
      storagePath: `documents/${orgA}/${documentId}/concurrent_test.pdf`,
      processingStatus: 'pending_review',
      uploadedBy: userAdminAId,
    };
    await testDb
      .insert(schema.documents)
      .values(concurrentDoc as unknown as typeof schema.documents.$inferInsert);

    await testDb.insert(schema.extractionStagings).values({
      id: stagingId,
      documentId,
      organizationId: orgA,
      status: 'pending_review',
      overallConfidence: 0.9,
      extractedFields: [],
    });

    const confirmPayload: ConfirmExtractionRequest = {
      stagingId,
      confirmedData: {
        title: 'Concurrent Verification Test',
        type: 'subscription',
        vendorName: 'Idempotency Vendor',
        amount: 5000,
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2027-06-01',
        noticePeriodDays: 30,
        autoRenew: true,
      },
    };

    // Trigger two concurrent confirmation attempts
    const [res1, res2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/ingestion/confirm',
        headers: { cookie: orgAAdminCookie },
        payload: confirmPayload,
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/ingestion/confirm',
        headers: { cookie: orgAAdminCookie },
        payload: confirmPayload,
      }),
    ]);

    const statusCodes = [res1.statusCode, res2.statusCode];
    // Exactly one must succeed with 201 Created
    expect(statusCodes.filter((code) => code === 201).length).toBe(1);
    // The other must be rejected (400 or 409)
    expect(statusCodes.some((code) => code === 400 || code === 409)).toBe(true);

    // Exactly one obligation exists in DB
    const obligations = await testDb
      .select()
      .from(schema.obligations)
      .where(eq(schema.obligations.organizationId, orgA));
    expect(obligations.length).toBe(1);

    // Subsequent rejection on already confirmed staging fails
    const staleReject = await app.inject({
      method: 'POST',
      url: `/api/v1/ingestion/staging/${stagingId}/reject`,
      headers: { cookie: orgAAdminCookie },
      payload: { reason: 'Late rejection attempt' },
    });
    expect([400, 409]).toContain(staleReject.statusCode);
  });

  it('rolls back transaction completely if obligation creation fails via database trigger', async () => {
    const documentId = crypto.randomUUID();
    const stagingId = crypto.randomUUID();

    const rollbackDoc: CanonicalDocumentInsertData = {
      id: documentId,
      organizationId: orgA,
      originalFilename: 'rollback_test.pdf',
      sanitizedFilename: 'rollback_test.pdf',
      declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      securityStatus: 'clean',
      fileSizeBytes: 50000,
      fileHashSha256: '0'.repeat(64),
      storagePath: `documents/${orgA}/${documentId}/rollback_test.pdf`,
      processingStatus: 'pending_review',
      uploadedBy: userAdminAId,
    };
    await testDb
      .insert(schema.documents)
      .values(rollbackDoc as unknown as typeof schema.documents.$inferInsert);

    await testDb.insert(schema.extractionStagings).values({
      id: stagingId,
      documentId,
      organizationId: orgA,
      status: 'pending_review',
      overallConfidence: 0.9,
      extractedFields: [],
    });

    // Create a real temporary PostgreSQL trigger on obligations that aborts on INSERT
    // to prove that the entire DB transaction rolls back under unexpected persistence failure
    await testClient.exec(`
      CREATE OR REPLACE FUNCTION fail_obligation_insert_test()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Simulated database transaction failure on obligation insert';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_fail_obligation_insert_test
      BEFORE INSERT ON obligations
      FOR EACH ROW
      EXECUTE FUNCTION fail_obligation_insert_test();
    `);

    try {
      const confirmRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ingestion/confirm',
        headers: { cookie: orgAAdminCookie },
        payload: {
          stagingId,
          confirmedData: {
            title: 'Rollback Obligation',
            type: 'contract',
            vendorName: 'Failure Corp',
            amount: 9999,
            currency: 'USD',
            billingFrequency: 'annual',
            renewalDate: '2027-01-01',
            noticePeriodDays: 30,
            autoRenew: false,
          },
        },
      });

      // Confirmation must fail
      expect(confirmRes.statusCode).toBeGreaterThanOrEqual(400);

      // Database check: staging record must NOT be confirmed; must remain pending_review
      const [staging] = await testDb
        .select()
        .from(schema.extractionStagings)
        .where(eq(schema.extractionStagings.id, stagingId));
      expect(staging?.status).toBe('pending_review');
      expect(staging?.reviewedBy).toBeNull();

      // Document must NOT be confirmed
      const [doc] = await testDb
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, documentId));
      expect(doc?.processingStatus).toBe('pending_review');
      expect(doc?.obligationId).toBeNull();

      // No obligation created
      const obligations = await testDb
        .select()
        .from(schema.obligations)
        .where(eq(schema.obligations.organizationId, orgA));
      expect(obligations.length).toBe(0);

      // No audit log recorded
      const auditLogs = await testDb
        .select()
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.organizationId, orgA),
            eq(schema.auditEvents.action, 'confirmed'),
          ),
        );
      expect(auditLogs.length).toBe(0);
    } finally {
      // Clean up temporary database trigger
      await testClient.exec(`
        DROP TRIGGER IF EXISTS trg_fail_obligation_insert_test ON obligations;
        DROP FUNCTION IF EXISTS fail_obligation_insert_test();
      `);
    }
  });
});
