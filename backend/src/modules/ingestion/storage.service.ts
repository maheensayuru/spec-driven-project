import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env.js';

export interface PresignedUploadResult {
  uploadUrl: string;
  storagePath: string;
  expiresInSeconds: number;
}

export class StorageService {
  private static client: S3Client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });

  /**
   * Generates a secure, 5-minute presigned upload URL partitioned by tenant.
   * Path invariant: documents/{organizationId}/{documentId}/{filename}
   */
  static async generatePresignedUploadUrl(
    organizationId: string,
    documentId: string,
    filename: string,
    mimeType: string,
  ): Promise<PresignedUploadResult> {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `documents/${organizationId}/${documentId}/${sanitizedFilename}`;

    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storagePath,
      ContentType: mimeType,
      Metadata: {
        organizationId,
        documentId,
      },
    });

    const expiresInSeconds = 300; // 5 minutes
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });

    return {
      uploadUrl,
      storagePath,
      expiresInSeconds,
    };
  }

  /**
   * Validates file content by checking binary magic byte signatures, preventing MIME spoofing.
   */
  static validateMagicBytes(
    buffer: Buffer,
  ): 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/tiff' | null {
    if (buffer.length < 4) {
      return null;
    }

    // PDF: %PDF- (\x25\x50\x44\x46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }

    // PNG: \x89PNG (\x89\x50\x4E\x47)
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }

    // JPEG: \xFF\xD8\xFF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    // TIFF: II*\0 (little endian: \x49\x49\x2A\x00) or MM\0* (big endian: \x4D\x4D\x00\x2A)
    if (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    ) {
      return 'image/tiff';
    }

    return null;
  }
}
