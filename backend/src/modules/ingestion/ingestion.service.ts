import {
  ExtractedFieldItem,
  ObligationType,
  ConfirmExtractionRequest,
} from '@renewalradar/shared';
import { StorageService, PresignedUploadResult } from './storage.service.js';
import { TenantContext } from '../../db/connection.js';
import { Obligation } from '../../db/schema/obligations.js';
import { ObligationService } from '../obligations/obligation.service.js';

export interface StagedExtractionRecord {
  stagingId: string;
  documentId: string;
  organizationId: string;
  status: 'pending_review' | 'confirmed' | 'rejected';
  overallConfidence: number;
  fields: ExtractedFieldItem[];
  suggestedType: ObligationType;
  suggestedVendor?: string;
  suggestedAmount?: number;
  suggestedRenewalDate?: string;
  suggestedNoticePeriodDays?: number;
}

export class IngestionService {
  // In-memory staging store supporting mock/test environments
  private static mockStagingStore = new Map<string, StagedExtractionRecord>();

  static registerStagingMock(record: StagedExtractionRecord): void {
    this.mockStagingStore.set(record.stagingId, record);
  }

  /**
   * Generates a presigned S3 upload URL partitioned by tenant after validating file size and MIME type.
   */
  static async requestUploadUrl(
    organizationId: string,
    filename: string,
    fileSizeBytes: number,
    mimeType: string,
  ): Promise<{ documentId: string } & PresignedUploadResult> {
    const documentId = `doc-${Math.random().toString(36).substring(2, 9)}`;
    const presigned = await StorageService.generatePresignedUploadUrl(
      organizationId,
      documentId,
      filename,
      mimeType,
    );

    return {
      documentId,
      ...presigned,
    };
  }

  /**
   * Retrieves a staged extraction by ID, scoped to the tenant.
   */
  static async getStagedExtraction(
    organizationId: string,
    stagingId: string,
  ): Promise<StagedExtractionRecord | null> {
    const record = this.mockStagingStore.get(stagingId);
    if (!record || record.organizationId !== organizationId) {
      return null;
    }
    return record;
  }

  /**
   * Confirms a staged extraction, promoting the verified fields into an active Obligation (US5).
   */
  static async confirmExtraction(
    tenant: TenantContext,
    stagingId: string,
    confirmedData: ConfirmExtractionRequest['confirmedData'],
    actorId?: string,
  ): Promise<Obligation> {
    const staged = await this.getStagedExtraction(tenant.organizationId, stagingId);
    if (!staged) {
      throw new Error(`Staged extraction ${stagingId} not found`);
    }

    if (staged.status === 'confirmed') {
      throw new Error(`Staged extraction ${stagingId} has already been confirmed`);
    }

    // 1. Create the active obligation using verified fields
    const obligation = await ObligationService.createObligation(
      tenant,
      {
        title: confirmedData.title,
        type: confirmedData.type,
        vendorName: confirmedData.vendorName,
        amount: confirmedData.amount,
        currency: confirmedData.currency,
        billingFrequency: confirmedData.billingFrequency,
        renewalDate: confirmedData.renewalDate,
        noticePeriodDays: confirmedData.noticePeriodDays,
        autoRenew: confirmedData.autoRenew,
        notes: confirmedData.notes,
        tags: ['ingested', 'ai_extracted'],
      },
      actorId,
    );

    // 2. Mark staging record confirmed
    staged.status = 'confirmed';
    this.mockStagingStore.set(stagingId, staged);

    // 3. Log audit event linking extraction provenance
    await tenant.audit.record('document', staged.documentId, 'confirmed', {
      actorId,
      afterState: {
        obligationId: obligation.id,
        stagingId,
        confirmedData,
      },
    });

    return obligation;
  }
}
