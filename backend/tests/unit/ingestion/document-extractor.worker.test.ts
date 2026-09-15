import crypto from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import {
  getDocumentExtractionJobId,
  processDocumentExtractionJob,
  DocumentExtractionJobDeps,
} from '../../../src/queue/workers/document-extractor.worker.js';

describe('Document Extractor Worker (Task T050)', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const docId = '22222222-2222-4222-8222-222222222222';

  it('generates a deterministic job ID based on organizationId and documentId', () => {
    const jobId1 = getDocumentExtractionJobId(orgId, docId);
    const jobId2 = getDocumentExtractionJobId(orgId, docId);
    expect(jobId1).toBe(`extract:${orgId}:${docId}`);
    expect(jobId1).toBe(jobId2);
  });

  it('skips parser and provider entirely for security-blocked documents', async () => {
    const mockDoc = {
      id: docId,
      organizationId: orgId,
      securityStatus: 'blocked',
      processingStatus: 'uploaded',
      storagePath: 'documents/path/test.pdf',
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([mockDoc]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    };

    const textExtractorMock = {
      extractText: vi.fn(),
    };
    const providerMock = {
      name: 'mock' as const,
      extract: vi.fn(),
    };

    await expect(
      processDocumentExtractionJob(
        { documentId: docId, organizationId: orgId },
        {
          db: mockDb as unknown as DocumentExtractionJobDeps['db'],
          textExtractor: textExtractorMock,
          extractionProvider: providerMock,
        },
      ),
    ).rejects.toThrow(/blocked by malware\/security scanner/);

    expect(textExtractorMock.extractText).not.toHaveBeenCalled();
    expect(providerMock.extract).not.toHaveBeenCalled();
  });

  it('idempotently returns existing staging if document is already in pending_review', async () => {
    const existingStagingId = crypto.randomUUID();
    const mockDoc = {
      id: docId,
      organizationId: orgId,
      securityStatus: 'clean',
      processingStatus: 'pending_review',
    };
    const mockStaging = {
      id: existingStagingId,
      documentId: docId,
      organizationId: orgId,
      status: 'pending_review',
    };

    let selectCallCount = 0;
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockDoc]);
            }
            return Promise.resolve([mockStaging]);
          },
        }),
      }),
      update: vi.fn(),
      insert: vi.fn(),
    };

    const textExtractorMock = { extractText: vi.fn() };
    const providerMock = { name: 'mock' as const, extract: vi.fn() };

    const result = await processDocumentExtractionJob(
      { documentId: docId, organizationId: orgId },
      {
        db: mockDb as unknown as DocumentExtractionJobDeps['db'],
        textExtractor: textExtractorMock,
        extractionProvider: providerMock,
      },
    );

    expect(result.success).toBe(true);
    expect(result.stagingId).toBe(existingStagingId);
    expect(textExtractorMock.extractText).not.toHaveBeenCalled();
    expect(providerMock.extract).not.toHaveBeenCalled();
  });

  it('fails with not found when document does not belong to organization (tenant boundary)', async () => {
    const wrongOrgId = '99999999-9999-4999-8999-999999999999';

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]), // not found for this tenant
        }),
      }),
    };

    await expect(
      processDocumentExtractionJob(
        { documentId: docId, organizationId: wrongOrgId },
        { db: mockDb as unknown as DocumentExtractionJobDeps['db'] },
      ),
    ).rejects.toThrow(/not found for organization/);
  });
});
