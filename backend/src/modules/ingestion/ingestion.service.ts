import crypto from 'node:crypto';
import type {
  SupportedDocumentMimeType,
  PresignUploadResponse,
  DocumentStatusResponse,
  ExtractionStagingDetail,
  ConfirmExtractionRequest,
  ExtractedFieldItem,
  ExtractionProviderMetadata,
  ExtractionStatus,
  DocumentProcessingStatus,
  DocumentSecurityStatus,
} from '@renewalradar/shared';
import type { TenantContext } from '../../db/connection.js';
import type { Obligation } from '../../db/schema/obligations.js';
import { IngestionRepository, NotFoundError, ValidationError } from './ingestion.repository.js';
import {
  StorageService,
  PresignedUploadResult,
  PresignedDownloadResult,
  PresignedDownloadOptions,
} from './storage.service.js';
import {
  validateDocumentContent,
  sanitizeDocumentFilename,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
} from './file-validation.service.js';
import { getDocumentExtractionJobId } from '../../queue/workers/document-extractor.worker.js';
import { documentSecurityScanner, DocumentSecurityScanner } from './document-security.scanner.js';
import { documentIngestionQueue } from '../../queue/queue.config.js';

export interface IngestionServiceDependencies {
  storage?: {
    headObject?(storagePath: string): Promise<{ contentLength: number; contentType?: string }>;
    getObject(storagePath: string, options?: { maxBytes?: number }): Promise<Buffer>;
    generatePresignedUploadUrl?(
      organizationId: string,
      documentId: string,
      filename: string,
      mimeType: string,
    ): Promise<PresignedUploadResult>;
    generatePresignedDownloadUrl?(
      options: PresignedDownloadOptions,
    ): Promise<PresignedDownloadResult>;
  };
  scanner?: DocumentSecurityScanner;
  queue?: {
    add(
      jobName: string,
      data: { documentId: string; organizationId: string },
      opts?: { jobId?: string },
    ): Promise<unknown>;
  };
}

export class IngestionService {
  private static defaultDependencies: IngestionServiceDependencies = {};

  /**
   * Set injectable default boundaries for tests.
   */
  static setDependencies(deps: IngestionServiceDependencies): void {
    this.defaultDependencies = deps;
  }

  static resetDependencies(): void {
    this.defaultDependencies = {};
  }

  /**
   * Generates a presigned S3 upload URL partitioned by tenant after persisting an initial upload_pending document row.
   */
  static async requestUploadUrl(
    organizationId: string,
    userId: string,
    filename: string,
    fileSizeBytes: number,
    mimeType: SupportedDocumentMimeType,
    deps?: IngestionServiceDependencies,
  ): Promise<PresignUploadResponse> {
    const documentId = crypto.randomUUID();
    const sanitizedFilename = sanitizeDocumentFilename(filename);
    const storagePath = `documents/${organizationId}/${documentId}/${sanitizedFilename}`;

    // 1. Persist initial document record in database strictly scoped to tenant
    await IngestionRepository.createDocument({
      id: documentId,
      organizationId,
      originalFilename: filename,
      sanitizedFilename,
      declaredMimeType: mimeType,
      fileSizeBytes,
      storagePath,
      processingStatus: 'upload_pending',
      securityStatus: 'scan_pending',
      uploadedBy: userId,
    });

    // 2. Generate secure tenant-scoped presigned upload URL (<= 300 seconds)
    const storageProvider = deps?.storage ?? this.defaultDependencies.storage ?? StorageService;
    const presigned = storageProvider.generatePresignedUploadUrl
      ? await storageProvider.generatePresignedUploadUrl(
          organizationId,
          documentId,
          sanitizedFilename,
          mimeType,
        )
      : await StorageService.generatePresignedUploadUrl(
          organizationId,
          documentId,
          sanitizedFilename,
          mimeType,
        );

    return {
      documentId,
      uploadUrl: presigned.uploadUrl,
      storagePath: presigned.storagePath,
      expiresInSeconds: presigned.expiresInSeconds,
    };
  }

  /**
   * Finalizes document upload: verifies real storage object, validates magic bytes and size,
   * performs security scan, marks document clean, and enqueues worker extraction.
   */
  static async finalizeDocument(
    organizationId: string,
    documentId: string,
    deps?: IngestionServiceDependencies,
  ): Promise<DocumentStatusResponse> {
    const document = await IngestionRepository.getDocumentById(organizationId, documentId);
    if (!document) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    // Idempotent return if already cleanly processed or enqueued
    if (
      ['processing', 'pending_review', 'confirmed', 'rejected'].includes(
        document.processingStatus,
      ) &&
      document.securityStatus === 'clean'
    ) {
      return this.getDocumentStatus(organizationId, documentId);
    }

    const storageProvider = deps?.storage ?? this.defaultDependencies.storage ?? StorageService;
    const scanner = deps?.scanner ?? this.defaultDependencies.scanner ?? documentSecurityScanner;
    const queue = deps?.queue ?? this.defaultDependencies.queue ?? documentIngestionQueue;
    // 1. Check object metadata if headObject is supported
    if (storageProvider.headObject) {
      try {
        const meta = await storageProvider.headObject(document.storagePath);
        if (meta.contentLength > MAX_DOCUMENT_FILE_SIZE_BYTES) {
          await IngestionRepository.updateDocumentStatus(organizationId, documentId, 'blocked', {
            failureReason: `File size exceeds maximum allowed limit of 25 MiB`,
            securityStatus: 'blocked',
          });
          throw new ValidationError('File size exceeds maximum allowed limit of 25 MiB');
        }
        if (meta.contentLength !== document.fileSizeBytes) {
          await IngestionRepository.updateDocumentStatus(organizationId, documentId, 'blocked', {
            failureReason: `Byte count mismatch: expected ${document.fileSizeBytes}, received ${meta.contentLength}`,
            securityStatus: 'blocked',
          });
          throw new ValidationError(
            `File size mismatch: declared ${document.fileSizeBytes} bytes, uploaded ${meta.contentLength} bytes`,
          );
        }
      } catch (headErr) {
        if (headErr instanceof ValidationError) throw headErr;
        // Continue if HEAD is unsupported in test fake
      }
    }

    // 2. Fetch real object buffer from storage bounded by 25 MiB
    let buffer: Buffer;
    try {
      buffer = await storageProvider.getObject(document.storagePath, {
        maxBytes: MAX_DOCUMENT_FILE_SIZE_BYTES,
      });
    } catch (err: unknown) {
      throw new ValidationError(
        `Uploaded document file could not be read from storage: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!buffer || buffer.length === 0) {
      throw new ValidationError('Uploaded document file not found or empty in storage');
    }
    // 2. Require exact declared byte count
    if (buffer.length !== document.fileSizeBytes) {
      await IngestionRepository.updateDocumentStatus(organizationId, documentId, 'blocked', {
        failureReason: `Byte count mismatch: expected ${document.fileSizeBytes}, received ${buffer.length}`,
        securityStatus: 'blocked',
      });
      throw new ValidationError(
        `File size mismatch: declared ${document.fileSizeBytes} bytes, uploaded ${buffer.length} bytes`,
      );
    }

    // 3. Validate binary magic bytes, MIME alignment, and anti-polyglot invariants
    const validationResult = validateDocumentContent(
      buffer,
      document.declaredMimeType as SupportedDocumentMimeType,
    );

    if (!validationResult.valid) {
      await IngestionRepository.updateDocumentStatus(organizationId, documentId, 'blocked', {
        failureReason: validationResult.error,
        securityStatus: 'blocked',
        detectedMimeType: validationResult.detectedMimeType ?? null,
      });
      throw new ValidationError(validationResult.error);
    }

    // 4. Invoke security scanner
    const scanResult = await scanner.scan(buffer, document.originalFilename);
    if (scanResult.status === 'blocked') {
      const reason = scanResult.reason ?? 'Document blocked by security scanner';
      await IngestionRepository.updateDocumentStatus(organizationId, documentId, 'blocked', {
        failureReason: reason,
        securityStatus: 'blocked',
        detectedMimeType: validationResult.detectedMimeType,
        fileHashSha256: validationResult.fileHashSha256,
      });
      throw new ValidationError(reason);
    }

    // 5. Update document to clean/uploaded status
    await IngestionRepository.updateDocumentStatus(organizationId, documentId, 'uploaded', {
      securityStatus: 'clean',
      detectedMimeType: validationResult.detectedMimeType,
      fileHashSha256: validationResult.fileHashSha256,
      failureReason: null,
    });

    // 6. Enqueue worker extraction job with deterministic job ID
    const jobId = getDocumentExtractionJobId(organizationId, documentId);
    await queue.add(
      'extract',
      {
        documentId,
        organizationId,
      },
      { jobId },
    );
    return this.getDocumentStatus(organizationId, documentId);
  }

  /**
   * Retrieves tenant-scoped document status according to DocumentStatusResponseSchema.
   */
  static async getDocumentStatus(
    organizationId: string,
    documentId: string,
  ): Promise<DocumentStatusResponse> {
    const document = await IngestionRepository.getDocumentById(organizationId, documentId);
    if (!document) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    const staging = await IngestionRepository.getStagingByDocumentId(organizationId, documentId);

    return {
      documentId: document.id,
      originalFilename: document.originalFilename,
      sanitizedFilename: document.sanitizedFilename,
      declaredMimeType: document.declaredMimeType as SupportedDocumentMimeType,
      detectedMimeType: (document.detectedMimeType as SupportedDocumentMimeType) || null,
      fileSizeBytes: document.fileSizeBytes,
      fileHashSha256: document.fileHashSha256 ?? null,
      processingStatus: document.processingStatus as DocumentProcessingStatus,
      securityStatus: document.securityStatus as DocumentSecurityStatus,
      stagingId: staging ? staging.id : null,
      failureReason: document.failureReason ?? null,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves tenant-scoped extraction staging detail including short-lived preview URL.
   */
  static async getStagedExtraction(
    organizationId: string,
    stagingId: string,
    deps?: IngestionServiceDependencies,
  ): Promise<ExtractionStagingDetail> {
    const staging = await IngestionRepository.getStagingById(organizationId, stagingId);
    if (!staging) {
      throw new NotFoundError(`Staged extraction ${stagingId} not found`);
    }

    const document = await IngestionRepository.getDocumentById(organizationId, staging.documentId);
    if (!document) {
      throw new NotFoundError(`Document for staging ${stagingId} not found`);
    }

    const storageProvider = deps?.storage ?? this.defaultDependencies.storage ?? StorageService;
    const preview = storageProvider.generatePresignedDownloadUrl
      ? await storageProvider.generatePresignedDownloadUrl({
          storagePath: document.storagePath,
          expiresInSeconds: 300,
          disposition: 'inline',
          mimeType: document.declaredMimeType,
        })
      : await StorageService.generatePresignedDownloadUrl({
          storagePath: document.storagePath,
          expiresInSeconds: 300,
          disposition: 'inline',
          mimeType: document.declaredMimeType,
        });

    return {
      stagingId: staging.id,
      documentId: staging.documentId,
      documentPreviewUrl: preview.downloadUrl,
      previewExpiresInSeconds: preview.expiresInSeconds ?? 300,
      filename: document.originalFilename,
      mimeType: document.declaredMimeType as SupportedDocumentMimeType,
      status: staging.status as ExtractionStatus,
      overallConfidence: staging.overallConfidence,
      fields: (staging.extractedFields as ExtractedFieldItem[]) || [],
      providerMetadata: (staging.providerMetadata as ExtractionProviderMetadata) || {
        provider: 'mock',
        model: 'mock-model',
        durationMs: 0,
      },
      reviewedBy: staging.reviewedBy ?? null,
      reviewedAt: staging.reviewedAt ? staging.reviewedAt.toISOString() : null,
      failureReason: staging.failureReason ?? null,
      createdAt: staging.createdAt.toISOString(),
    };
  }

  /**
   * Confirms a staged extraction, promoting verified fields into an active Obligation in a single transaction.
   */
  static async confirmExtraction(
    tenant: TenantContext,
    stagingId: string,
    confirmedData: ConfirmExtractionRequest['confirmedData'],
    actorId?: string,
  ): Promise<Obligation> {
    return IngestionRepository.confirmExtractionTransactional(
      tenant,
      stagingId,
      confirmedData,
      actorId,
    );
  }

  /**
   * Rejects a staged extraction in a single transaction.
   */
  static async rejectExtraction(
    tenant: TenantContext,
    stagingId: string,
    reason: string,
    actorId?: string,
  ): Promise<{ success: boolean; stagingId: string; status: string }> {
    return IngestionRepository.rejectExtractionTransactional(tenant, stagingId, reason, actorId);
  }
}
