import { eq, and, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema/index.js';
import type {
  ExtractedFieldItem,
  ConfirmExtractionRequest,
  ExtractionProviderMetadata,
} from '@renewalradar/shared';
import type { TenantContext } from '../../db/connection.js';
import {
  calculateCancellationDeadline,
  validateObligationDates,
} from '../obligations/deadline.calculator.js';
import { ObligationService } from '../obligations/obligation.service.js';

export class IngestionDomainError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'IngestionDomainError';
  }
}

export class NotFoundError extends IngestionDomainError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends IngestionDomainError {
  constructor(message: string = 'Resource is in a conflicting state') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends IngestionDomainError {
  constructor(message: string = 'Validation failed') {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export interface CreateDocumentParams {
  id?: string;
  organizationId: string;
  originalFilename: string;
  sanitizedFilename: string;
  declaredMimeType: string;
  detectedMimeType?: string | null;
  securityStatus?: string;
  fileSizeBytes: number;
  fileHashSha256?: string | null;
  storagePath: string;
  processingStatus?: string;
  uploadedBy: string;
}

export interface CreateStagingParams {
  id?: string;
  documentId: string;
  organizationId: string;
  status?: string;
  overallConfidence?: number;
  extractedFields: ExtractedFieldItem[] | unknown;
  providerMetadata?: ExtractionProviderMetadata | unknown;
  failureReason?: string | null;
}

export class IngestionRepository {
  /**
   * Persists a newly initiated document upload row.
   */
  static async createDocument(data: CreateDocumentParams): Promise<schema.Document> {
    const [inserted] = await db
      .insert(schema.documents)
      .values({
        id: data.id ?? crypto.randomUUID(),
        organizationId: data.organizationId,
        originalFilename: data.originalFilename,
        sanitizedFilename: data.sanitizedFilename,
        declaredMimeType: data.declaredMimeType,
        detectedMimeType: data.detectedMimeType ?? null,
        securityStatus: data.securityStatus ?? 'scan_pending',
        fileSizeBytes: data.fileSizeBytes,
        fileHashSha256: data.fileHashSha256 ?? null,
        storagePath: data.storagePath,
        processingStatus: data.processingStatus ?? 'upload_pending',
        uploadedBy: data.uploadedBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return inserted;
  }

  /**
   * Retrieves a document by ID strictly scoped to the tenant organization.
   */
  static async getDocumentById(
    organizationId: string,
    documentId: string,
  ): Promise<schema.Document | null> {
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.id, documentId),
          eq(schema.documents.organizationId, organizationId),
        ),
      )
      .limit(1);

    return doc ?? null;
  }

  /**
   * Updates document status and security/hash metadata scoped to the tenant.
   */
  static async updateDocumentStatus(
    organizationId: string,
    documentId: string,
    processingStatus: string,
    options?: {
      failureReason?: string | null;
      detectedMimeType?: string | null;
      fileHashSha256?: string | null;
      securityStatus?: string;
    },
  ): Promise<schema.Document> {
    const updateData: Partial<typeof schema.documents.$inferInsert> = {
      processingStatus,
      updatedAt: new Date(),
    };

    if (options?.failureReason !== undefined) {
      updateData.failureReason = options.failureReason;
    }
    if (options?.detectedMimeType !== undefined) {
      updateData.detectedMimeType = options.detectedMimeType;
    }
    if (options?.fileHashSha256 !== undefined) {
      updateData.fileHashSha256 = options.fileHashSha256;
    }
    if (options?.securityStatus !== undefined) {
      updateData.securityStatus = options.securityStatus;
    }

    const [updated] = await db
      .update(schema.documents)
      .set(updateData)
      .where(
        and(
          eq(schema.documents.id, documentId),
          eq(schema.documents.organizationId, organizationId),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    return updated;
  }

  /**
   * Creates a new extraction staging record.
   */
  static async createStaging(data: CreateStagingParams): Promise<schema.ExtractionStaging> {
    const [staging] = await db
      .insert(schema.extractionStagings)
      .values({
        id: data.id ?? crypto.randomUUID(),
        documentId: data.documentId,
        organizationId: data.organizationId,
        status: data.status ?? 'pending_review',
        overallConfidence: data.overallConfidence ?? 0.0,
        extractedFields: data.extractedFields as unknown as Record<string, unknown>,
        providerMetadata: (data.providerMetadata as unknown as Record<string, unknown>) ?? null,
        failureReason: data.failureReason ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return staging;
  }

  /**
   * Retrieves a staging record strictly scoped to tenant.
   */
  static async getStagingById(
    organizationId: string,
    stagingId: string,
  ): Promise<schema.ExtractionStaging | null> {
    const [staging] = await db
      .select()
      .from(schema.extractionStagings)
      .where(
        and(
          eq(schema.extractionStagings.id, stagingId),
          eq(schema.extractionStagings.organizationId, organizationId),
        ),
      )
      .limit(1);

    return staging ?? null;
  }

  /**
   * Retrieves a staging record by documentId strictly scoped to tenant.
   */
  static async getStagingByDocumentId(
    organizationId: string,
    documentId: string,
  ): Promise<schema.ExtractionStaging | null> {
    const [staging] = await db
      .select()
      .from(schema.extractionStagings)
      .where(
        and(
          eq(schema.extractionStagings.documentId, documentId),
          eq(schema.extractionStagings.organizationId, organizationId),
        ),
      )
      .limit(1);

    return staging ?? null;
  }

  /**
   * Updates staging status and review metadata scoped to tenant.
   */
  static async updateStagingStatus(
    organizationId: string,
    stagingId: string,
    status: string,
    options?: {
      failureReason?: string | null;
      reviewedBy?: string | null;
      reviewedAt?: Date | null;
      extractedFields?: unknown;
    },
  ): Promise<schema.ExtractionStaging> {
    const updateData: Partial<typeof schema.extractionStagings.$inferInsert> = {
      status,
      updatedAt: new Date(),
    };

    if (options?.failureReason !== undefined) {
      updateData.failureReason = options.failureReason;
    }
    if (options?.reviewedBy !== undefined) {
      updateData.reviewedBy = options.reviewedBy;
    }
    if (options?.reviewedAt !== undefined) {
      updateData.reviewedAt = options.reviewedAt;
    }
    if (options?.extractedFields !== undefined) {
      updateData.extractedFields = options.extractedFields as unknown as Record<string, unknown>;
    }

    const [updated] = await db
      .update(schema.extractionStagings)
      .set(updateData)
      .where(
        and(
          eq(schema.extractionStagings.id, stagingId),
          eq(schema.extractionStagings.organizationId, organizationId),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundError(`Staging record ${stagingId} not found`);
    }

    return updated;
  }

  /**
   * Confirms a staged extraction in an atomic database transaction guarded by status='pending_review'.
   * Exactly one concurrent confirmation wins; concurrent/stale requests receive ConflictError (409).
   */
  static async confirmExtractionTransactional(
    tenant: TenantContext,
    stagingId: string,
    confirmedData: ConfirmExtractionRequest['confirmedData'],
    actorId?: string,
  ): Promise<schema.Obligation> {
    const organizationId = tenant.organizationId;

    return await db.transaction(async (tx) => {
      // 1. Verify existence and tenant ownership
      const [existingStaging] = await tx
        .select()
        .from(schema.extractionStagings)
        .where(
          and(
            eq(schema.extractionStagings.id, stagingId),
            eq(schema.extractionStagings.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!existingStaging) {
        throw new NotFoundError(`Staged extraction ${stagingId} not found`);
      }

      if (existingStaging.status !== 'pending_review') {
        throw new ConflictError(
          `Staged extraction ${stagingId} has already been ${existingStaging.status}`,
        );
      }

      // 2. Validate dates
      validateObligationDates({
        renewalDate: confirmedData.renewalDate,
        expirationDate: confirmedData.expirationDate,
      });

      // 3. Compute corrections while preserving immutable original AI values
      const now = new Date();
      const nowIso = now.toISOString();
      const originalFields = (existingStaging.extractedFields as ExtractedFieldItem[]) || [];

      const updatedFields: ExtractedFieldItem[] = originalFields.map((field) => {
        const fieldName = field.fieldName as keyof typeof confirmedData;
        const userValue = confirmedData[fieldName];

        if (userValue !== undefined && userValue !== field.extractedValue) {
          return {
            ...field,
            correctedValue: userValue as string | number | boolean | null,
            correctedBy: actorId,
            correctedAt: nowIso,
          };
        }
        return { ...field };
      });

      // 4. Atomically claim staging record guarded by status='pending_review'
      const [claimedStaging] = await tx
        .update(schema.extractionStagings)
        .set({
          status: 'confirmed',
          reviewedBy: actorId ?? null,
          reviewedAt: now,
          extractedFields: updatedFields as unknown as Record<string, unknown>,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.extractionStagings.id, stagingId),
            eq(schema.extractionStagings.organizationId, organizationId),
            eq(schema.extractionStagings.status, 'pending_review'),
          ),
        )
        .returning();

      if (!claimedStaging) {
        throw new ConflictError(`Staged extraction ${stagingId} is no longer pending review`);
      }

      // 5. Find or create vendor within transaction
      let vendor: schema.Vendor | undefined;
      if (confirmedData.vendorName) {
        const normalizedName = confirmedData.vendorName.trim();
        const [existingVendor] = await tx
          .select()
          .from(schema.vendors)
          .where(
            and(
              eq(schema.vendors.organizationId, organizationId),
              sql`lower(${schema.vendors.name}) = lower(${normalizedName})`,
            ),
          )
          .limit(1);

        if (existingVendor) {
          vendor = existingVendor;
        } else {
          const [newVendor] = await tx
            .insert(schema.vendors)
            .values({
              organizationId,
              name: normalizedName,
            })
            .returning();
          vendor = newVendor;
        }
      }

      // 6. Calculate cancellation deadline and risk level using canonical business logic
      const noticePeriodDays = confirmedData.noticePeriodDays ?? 30;
      const cancellationDeadline = calculateCancellationDeadline(
        confirmedData.renewalDate,
        noticePeriodDays,
      );

      const riskLevel = ObligationService.calculateRiskLevel(
        confirmedData.renewalDate,
        cancellationDeadline,
        confirmedData.amount,
      );

      // 7. Create active obligation
      const [obligation] = await tx
        .insert(schema.obligations)
        .values({
          organizationId,
          vendorId: vendor?.id,
          title: confirmedData.title,
          type: confirmedData.type,
          status: 'active',
          amount: String(confirmedData.amount),
          currency: confirmedData.currency ?? 'USD',
          billingFrequency: confirmedData.billingFrequency,
          renewalDate: confirmedData.renewalDate,
          expirationDate: confirmedData.expirationDate,
          noticePeriodDays,
          cancellationDeadline,
          autoRenew: confirmedData.autoRenew ?? true,
          riskLevel,
          notes: confirmedData.notes,
          tags: ['ingested', 'ai_extracted'],
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // 8. Update linked document status and obligation reference
      await tx
        .update(schema.documents)
        .set({
          processingStatus: 'confirmed',
          obligationId: obligation.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.documents.id, existingStaging.documentId),
            eq(schema.documents.organizationId, organizationId),
          ),
        );

      // 9. Persist immutable audit event
      await tx.insert(schema.auditEvents).values({
        organizationId,
        actorId: actorId ?? null,
        entityType: 'document',
        entityId: existingStaging.documentId,
        action: 'confirmed',
        beforeState: {
          stagingStatus: existingStaging.status,
          stagingId,
        },
        afterState: {
          obligationId: obligation.id,
          stagingId,
          confirmedData,
        },
        createdAt: now,
      });

      return {
        ...obligation,
        amount: String(confirmedData.amount),
      };
    });
  }

  /**
   * Rejects a staged extraction in an atomic database transaction guarded by status='pending_review'.
   */
  static async rejectExtractionTransactional(
    tenant: TenantContext,
    stagingId: string,
    reason: string,
    actorId?: string,
  ): Promise<{ success: boolean; stagingId: string; status: string }> {
    const organizationId = tenant.organizationId;

    return await db.transaction(async (tx) => {
      // 1. Verify existence and tenant ownership
      const [existingStaging] = await tx
        .select()
        .from(schema.extractionStagings)
        .where(
          and(
            eq(schema.extractionStagings.id, stagingId),
            eq(schema.extractionStagings.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!existingStaging) {
        throw new NotFoundError(`Staged extraction ${stagingId} not found`);
      }

      if (existingStaging.status !== 'pending_review') {
        throw new ConflictError(
          `Staged extraction ${stagingId} has already been ${existingStaging.status}`,
        );
      }

      const now = new Date();

      // 2. Atomically claim and mark rejected
      const [claimedStaging] = await tx
        .update(schema.extractionStagings)
        .set({
          status: 'rejected',
          failureReason: reason,
          reviewedBy: actorId ?? null,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.extractionStagings.id, stagingId),
            eq(schema.extractionStagings.organizationId, organizationId),
            eq(schema.extractionStagings.status, 'pending_review'),
          ),
        )
        .returning();

      if (!claimedStaging) {
        throw new ConflictError(`Staged extraction ${stagingId} is no longer pending review`);
      }

      // 3. Update document status to rejected
      await tx
        .update(schema.documents)
        .set({
          processingStatus: 'rejected',
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.documents.id, existingStaging.documentId),
            eq(schema.documents.organizationId, organizationId),
          ),
        );

      // 4. Record audit event
      await tx.insert(schema.auditEvents).values({
        organizationId,
        actorId: actorId ?? null,
        entityType: 'document',
        entityId: existingStaging.documentId,
        action: 'rejected',
        beforeState: {
          stagingStatus: existingStaging.status,
          stagingId,
        },
        afterState: {
          stagingId,
          reason,
        },
        createdAt: now,
      });

      return {
        success: true,
        stagingId,
        status: 'rejected',
      };
    });
  }
}
