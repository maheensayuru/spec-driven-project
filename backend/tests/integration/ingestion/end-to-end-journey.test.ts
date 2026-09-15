import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { resetTestDatabase, testDb } from '../../helpers/test-database.js';
import * as schema from '../../../src/db/schema/index.js';
// Hoisted Vitest mock factory: dynamic import inside callback is required to avoid TDZ access to testDb.
vi.mock('../../../src/db/client.js', async () => {
  const { testDb } = await import('../../helpers/test-database.js');
  return { db: testDb };
});

import { buildServer } from '../../../src/server.js';
import { SessionService } from '../../../src/modules/auth/session.service.js';
import { IngestionService } from '../../../src/modules/ingestion/ingestion.service.js';
import { processDocumentExtractionJob } from '../../../src/queue/workers/document-extractor.worker.js';
import type { ConfirmExtractionRequest } from '@renewalradar/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePdfPath = path.resolve(__dirname, '../../fixtures/us5-vendor-agreement.pdf');

describe('US5 End-to-End Ingestion & Verification Journey (Full Mock-Provider Flow)', () => {
  let app: FastifyInstance;
  const orgId = '33333333-3333-4333-8333-333333333333';
  const userId = '44444444-4444-4444-8444-444444444444';
  let adminSessionCookie: string;

  const storageMap = new Map<string, Buffer>();

  beforeAll(async () => {
    const token = SessionService.encryptSession({
      userId,
      organizationId: orgId,
      role: 'admin',
      email: 'admin@journey.corp',
      createdAt: Date.now(),
    });
    adminSessionCookie = `rr_session=${token}`;

    IngestionService.setDependencies({
      storage: {
        async getObject(storagePath: string) {
          return storageMap.get(storagePath) || Buffer.alloc(0);
        },
        async headObject(storagePath: string) {
          const buf = storageMap.get(storagePath);
          return { contentLength: buf ? buf.length : 0, contentType: 'application/pdf' };
        },
        async generatePresignedUploadUrl(organizationId, documentId, filename) {
          const storagePath = `documents/${organizationId}/${documentId}/${filename}`;
          return {
            uploadUrl: `https://mock-s3.local/${storagePath}`,
            storagePath,
            expiresInSeconds: 300,
          };
        },
        async generatePresignedDownloadUrl(options) {
          return {
            downloadUrl: `https://mock-s3.local/${options.storagePath}?preview=true`,
            expiresInSeconds: options.expiresInSeconds ?? 300,
          };
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
    storageMap.clear();

    await testDb.insert(schema.organizations).values({
      id: orgId,
      name: 'Journey Acme',
      slug: 'journey-acme',
      defaultCurrency: 'USD',
      tier: 'business',
    });

    await testDb.insert(schema.users).values({
      id: userId,
      email: 'admin@journey.corp',
      fullName: 'Journey Admin',
      passwordHash: 'mock',
    });

    await testDb.insert(schema.organizationMembers).values({
      organizationId: orgId,
      userId,
      role: 'admin',
    });
  });

  it('completes the entire journey: Presign -> Upload -> Finalize -> Worker Extract -> Staging Inspect -> Confirm -> Active Obligation', async () => {
    const fixturePdfBuffer = fs.readFileSync(fixturePdfPath);
    expect(fixturePdfBuffer.length).toBeGreaterThan(0);

    // Step 1: Request presigned upload URL
    const uploadUrlRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/upload-url',
      headers: { cookie: adminSessionCookie },
      payload: {
        filename: 'Acme Cloud Agreement 2027.pdf',
        fileSizeBytes: fixturePdfBuffer.length,
        mimeType: 'application/pdf',
      },
    });

    expect(uploadUrlRes.statusCode).toBe(200);
    const uploadUrlBody = JSON.parse(uploadUrlRes.body);
    const { documentId, storagePath } = uploadUrlBody;
    expect(documentId).toBeDefined();
    expect(storagePath).toContain(orgId);

    // Step 2: Simulate client PUT to object storage
    storageMap.set(storagePath, fixturePdfBuffer);

    // Step 3: Finalize upload
    const finalizeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ingestion/documents/${documentId}/finalize`,
      headers: { cookie: adminSessionCookie },
    });

    expect(finalizeRes.statusCode).toBe(200);
    const finalizeBody = JSON.parse(finalizeRes.body);
    expect(finalizeBody.processingStatus).toBe('uploaded');
    expect(finalizeBody.securityStatus).toBe('clean');
    // Step 4: Worker processes document extraction job
    const workerResult = await processDocumentExtractionJob(
      {
        documentId,
        organizationId: orgId,
      },
      {
        storageService: {
          async getObject(storagePath: string) {
            return storageMap.get(storagePath) || Buffer.alloc(0);
          },
        },
      },
    );

    expect(workerResult.success).toBe(true);
    const stagingId = workerResult.stagingId;
    expect(stagingId).toBeDefined();

    // Verify document status updated to pending_review with linked staging
    const docStatusRes = await app.inject({
      method: 'GET',
      url: `/api/v1/ingestion/documents/${documentId}`,
      headers: { cookie: adminSessionCookie },
    });
    expect(docStatusRes.statusCode).toBe(200);
    const docStatusBody = JSON.parse(docStatusRes.body);
    expect(docStatusBody.processingStatus).toBe('pending_review');
    expect(docStatusBody.stagingId).toBe(stagingId);

    // Step 5: Fetch staged extraction details for human verification
    const stagingRes = await app.inject({
      method: 'GET',
      url: `/api/v1/ingestion/staging/${stagingId}`,
      headers: { cookie: adminSessionCookie },
    });
    expect(stagingRes.statusCode).toBe(200);
    const stagingBody = JSON.parse(stagingRes.body);
    expect(stagingBody.status).toBe('pending_review');
    expect(stagingBody.overallConfidence).toBeGreaterThanOrEqual(0.85);
    expect(stagingBody.documentPreviewUrl).toContain('preview=true');

    // Extracted fields from deterministic PDF fixture:
    const fieldMap = new Map(
      stagingBody.fields.map((f: { fieldName: string; extractedValue: unknown }) => [
        f.fieldName,
        f.extractedValue,
      ]),
    );
    expect(fieldMap.get('title')).toBe('Acme Renewal Platform');
    expect(fieldMap.get('vendorName')).toBe('Acme Cloud LLC');
    expect(fieldMap.get('amount')).toBe(12000);
    expect(fieldMap.get('renewalDate')).toBe('2027-06-30');

    // Step 6: User verifies, updates amount to 12500, and confirms extraction
    const confirmPayload: ConfirmExtractionRequest = {
      stagingId,
      confirmedData: {
        title: 'Acme Renewal Platform Enterprise',
        type: 'subscription',
        vendorName: 'Acme Cloud LLC',
        amount: 12500, // User corrected value
        currency: 'USD',
        billingFrequency: 'annual',
        renewalDate: '2027-06-30',
        expirationDate: '2028-06-30',
        noticePeriodDays: 45,
        autoRenew: true,
        notes: 'Verified against contract terms by Journey Admin',
      },
    };

    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ingestion/confirm',
      headers: { cookie: adminSessionCookie },
      payload: confirmPayload,
    });

    expect(confirmRes.statusCode).toBe(201);
    const createdObligation = JSON.parse(confirmRes.body);
    expect(createdObligation.id).toBeDefined();
    expect(createdObligation.status).toBe('active');
    expect(createdObligation.amount).toBe('12500');
    expect(createdObligation.cancellationDeadline).toBe('2027-05-16'); // 45 days before 2027-06-30

    // Step 7: Verify final database consistency:
    // a. Document is linked to created obligation and status is confirmed
    const [finalDoc] = await testDb
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    expect(finalDoc?.processingStatus).toBe('confirmed');
    expect(finalDoc?.obligationId).toBe(createdObligation.id);

    // b. Staging is marked confirmed with provenance (original extracted value alongside user correction)
    const [finalStaging] = await testDb
      .select()
      .from(schema.extractionStagings)
      .where(eq(schema.extractionStagings.id, stagingId));
    expect(finalStaging?.status).toBe('confirmed');
    expect(finalStaging?.reviewedBy).toBe(userId);
    const confirmedFields = finalStaging?.extractedFields as Array<{
      fieldName: string;
      extractedValue: unknown;
      correctedValue?: unknown;
    }>;
    const amountField = confirmedFields.find((f) => f.fieldName === 'amount');
    expect(amountField?.extractedValue).toBe(12000); // Immutable AI value
    expect(amountField?.correctedValue).toBe(12500); // User correction

    // c. Vendor record created
    const [vendor] = await testDb
      .select()
      .from(schema.vendors)
      .where(eq(schema.vendors.organizationId, orgId));
    expect(vendor).toBeDefined();
    expect(vendor?.name).toBe('Acme Cloud LLC');

    // d. Obligation queryable via standard API
    const getObligationRes = await app.inject({
      method: 'GET',
      url: `/api/v1/obligations/${createdObligation.id}`,
      headers: { cookie: adminSessionCookie },
    });
    expect(getObligationRes.statusCode).toBe(200);
    const fetchedObligation = JSON.parse(getObligationRes.body);
    expect(fetchedObligation.vendorName).toBe('Acme Cloud LLC');
    expect(fetchedObligation.tags).toContain('ingested');
  });
});
