import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { SupportedDocumentMimeType } from '@renewalradar/shared';
import { env } from '../../config/env.js';
import { detectMagicBytes, sanitizeDocumentFilename } from './file-validation.service.js';

export interface PresignedUploadResult {
  uploadUrl: string;
  storagePath: string;
  expiresInSeconds: number;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresInSeconds: number;
}

export interface PresignedUploadOptions {
  organizationId: string;
  documentId: string;
  filename: string;
  mimeType: string;
  expiresInSeconds?: number;
}

export interface PresignedDownloadOptions {
  storagePath: string;
  filename?: string;
  mimeType?: string;
  disposition?: 'inline' | 'attachment';
  expiresInSeconds?: number;
}

export interface ObjectMetadataResult {
  contentLength: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export class StorageService {
  private client: S3Client;
  private bucket: string;
  private bucketInitialized = false;

  private static defaultInstance: StorageService | null = null;

  constructor(customClient?: S3Client, bucketName?: string) {
    this.bucket = bucketName ?? env.S3_BUCKET;
    this.client =
      customClient ??
      new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      });
  }

  static getInstance(): StorageService {
    if (!this.defaultInstance) {
      this.defaultInstance = new StorageService();
    }
    return this.defaultInstance;
  }

  /**
   * Lazily ensures the S3/MinIO bucket exists and configures browser CORS.
   */
  async ensureBucket(): Promise<void> {
    if (this.bucketInitialized) {
      return;
    }
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      const isNotFound =
        error?.name === 'NotFound' ||
        error?.name === 'NoSuchBucket' ||
        error?.$metadata?.httpStatusCode === 404;
      if (isNotFound) {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        } catch (createErr: unknown) {
          const cError = createErr as { name?: string };
          const isRace =
            cError?.name === 'BucketAlreadyOwnedByYou' || cError?.name === 'BucketAlreadyExists';
          if (!isRace) {
            if (env.NODE_ENV !== 'test') {
              throw createErr;
            }
            return;
          }
        }
      } else {
        if (env.NODE_ENV !== 'test') {
          throw err;
        }
        return;
      }
    }

    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'HEAD'],
                AllowedOrigins: [env.FRONTEND_URL],
                ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        }),
      );
    } catch {
      // Some local S3 test environments do not support CORS commands; ignore gracefully
    }

    this.bucketInitialized = true;
  }

  /**
   * Builds the canonical tenant-partitioned object key:
   * documents/{organizationId}/{documentId}/{sanitizedFilename}
   */
  static getStoragePath(
    organizationId: string,
    documentId: string,
    sanitizedFilename: string,
  ): string {
    return `documents/${organizationId}/${documentId}/${sanitizedFilename}`;
  }

  /**
   * Generates a secure presigned upload URL (PUT) expiring in <= 300 seconds.
   * Supports both positional arguments and options object.
   */
  async generatePresignedUploadUrl(
    orgIdOrOptions: string | PresignedUploadOptions,
    docId?: string,
    fname?: string,
    mtype?: string,
    expiresIn?: number,
  ): Promise<PresignedUploadResult> {
    let organizationId: string;
    let documentId: string;
    let filename: string;
    let mimeType: string;
    let requestedExpires = 300;

    if (typeof orgIdOrOptions === 'object') {
      organizationId = orgIdOrOptions.organizationId;
      documentId = orgIdOrOptions.documentId;
      filename = orgIdOrOptions.filename;
      mimeType = orgIdOrOptions.mimeType;
      requestedExpires = orgIdOrOptions.expiresInSeconds ?? 300;
    } else {
      organizationId = orgIdOrOptions;
      documentId = docId!;
      filename = fname!;
      mimeType = mtype!;
      requestedExpires = expiresIn ?? 300;
    }

    const expiresInSeconds = Math.min(Math.max(1, requestedExpires), 300);
    const sanitizedFilename = sanitizeDocumentFilename(filename);
    const storagePath = StorageService.getStoragePath(
      organizationId,
      documentId,
      sanitizedFilename,
    );

    await this.ensureBucket();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storagePath,
      ContentType: mimeType,
      Metadata: {
        organizationId,
        documentId,
      },
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      uploadUrl,
      storagePath,
      expiresInSeconds,
    };
  }

  static async generatePresignedUploadUrl(
    orgIdOrOptions: string | PresignedUploadOptions,
    docId?: string,
    fname?: string,
    mtype?: string,
    expiresIn?: number,
  ): Promise<PresignedUploadResult> {
    return this.getInstance().generatePresignedUploadUrl(
      orgIdOrOptions,
      docId,
      fname,
      mtype,
      expiresIn,
    );
  }

  /**
   * Generates a signed preview or attachment download URL expiring in <= 300 seconds.
   * Explicitly sets Content-Disposition and Content-Type. No public or permanent URL is ever produced.
   */
  async generatePresignedDownloadUrl(
    options: PresignedDownloadOptions,
  ): Promise<PresignedDownloadResult> {
    const expiresInSeconds = Math.min(Math.max(1, options.expiresInSeconds ?? 300), 300);

    const disposition = options.disposition ?? 'inline';
    let responseContentDisposition = 'inline';
    if (disposition === 'attachment') {
      const downloadName = options.filename
        ? sanitizeDocumentFilename(options.filename)
        : (options.storagePath.split('/').pop() ?? 'download');
      responseContentDisposition = `attachment; filename="${downloadName}"`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: options.storagePath,
      ResponseContentDisposition: responseContentDisposition,
      ResponseContentType: options.mimeType,
    });

    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      downloadUrl,
      expiresInSeconds,
    };
  }

  static async generatePresignedDownloadUrl(
    options: PresignedDownloadOptions,
  ): Promise<PresignedDownloadResult> {
    return this.getInstance().generatePresignedDownloadUrl(options);
  }

  /**
   * Retrieves object headers (Content-Length, Content-Type, ETag, LastModified).
   */
  async headObject(storagePath: string): Promise<ObjectMetadataResult> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
      }),
    );

    return {
      contentLength: response.ContentLength ?? 0,
      contentType: response.ContentType,
      etag: response.ETag,
      lastModified: response.LastModified,
      metadata: response.Metadata,
    };
  }

  static async headObject(storagePath: string): Promise<ObjectMetadataResult> {
    return this.getInstance().headObject(storagePath);
  }

  /**
   * Retrieves object content, bounded by options.maxBytes to prevent memory exhaustion.
   */
  async getObject(storagePath: string, options?: { maxBytes?: number }): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storagePath,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      return Buffer.alloc(0);
    }

    const stream = response.Body as unknown as {
      transformToByteArray?: () => Promise<Uint8Array>;
      [Symbol.asyncIterator]?: () => AsyncIterableIterator<Uint8Array | Buffer>;
    };

    if (typeof stream.transformToByteArray === 'function') {
      const bytes = await stream.transformToByteArray();
      const buf = Buffer.from(bytes);
      if (options?.maxBytes && buf.length > options.maxBytes) {
        throw new Error(
          `Object size (${buf.length} bytes) exceeds bounded maximum read limit (${options.maxBytes} bytes)`,
        );
      }
      return buf;
    }

    if (stream[Symbol.asyncIterator]) {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer>) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(b);
        total += b.length;
        if (options?.maxBytes && total > options.maxBytes) {
          throw new Error(
            `Object size exceeds bounded maximum read limit (${options.maxBytes} bytes)`,
          );
        }
      }
      return Buffer.concat(chunks);
    }

    return Buffer.alloc(0);
  }

  static async getObject(storagePath: string, options?: { maxBytes?: number }): Promise<Buffer> {
    return this.getInstance().getObject(storagePath, options);
  }

  /**
   * Direct alias for getObject returning Buffer.
   */
  async getObjectBuffer(storagePath: string, options?: { maxBytes?: number }): Promise<Buffer> {
    return this.getObject(storagePath, options);
  }

  static async getObjectBuffer(
    storagePath: string,
    options?: { maxBytes?: number },
  ): Promise<Buffer> {
    return this.getInstance().getObjectBuffer(storagePath, options);
  }

  /**
   * Deletes an object by key.
   */
  async deleteObject(storagePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
      }),
    );
  }

  static async deleteObject(storagePath: string): Promise<void> {
    return this.getInstance().deleteObject(storagePath);
  }

  /**
   * Puts an object directly into storage.
   */
  async putObject(
    storagePath: string,
    content: Buffer,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
        Body: content,
        ContentType: contentType,
        Metadata: metadata,
      }),
    );
  }

  static async putObject(
    storagePath: string,
    content: Buffer,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    return this.getInstance().putObject(storagePath, content, contentType, metadata);
  }

  /**
   * Validates file content by checking binary magic byte signatures.
   */
  static validateMagicBytes(buffer: Buffer): SupportedDocumentMimeType | null {
    return detectMagicBytes(buffer);
  }
}

export const storageService = StorageService.getInstance();
