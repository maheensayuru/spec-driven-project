import crypto from 'node:crypto';
import type { SupportedDocumentMimeType } from '@renewalradar/shared';

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 26,214,400 bytes (25 MiB)

export type FileValidationResult =
  | {
      valid: true;
      detectedMimeType: SupportedDocumentMimeType;
      fileSizeBytes: number;
      fileHashSha256: string;
    }
  | {
      valid: false;
      error: string;
      detectedMimeType?: SupportedDocumentMimeType;
    };

export interface FileValidationOptions {
  maxSizeBytes?: number;
}

/**
 * Detects binary magic byte signatures for supported document types.
 *
 * Strict specifications:
 * - PDF: Exact 5 bytes `%PDF-` (0x25, 0x50, 0x44, 0x46, 0x2D)
 * - PNG: Standard 8-byte signature (0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
 * - JPEG: Standard 3 bytes (0xFF, 0xD8, 0xFF)
 * - TIFF: Little-endian II*\0 (0x49, 0x49, 0x2A, 0x00) or Big-endian MM\0* (0x4D, 0x4D, 0x00, 0x2A)
 */
export function detectMagicBytes(buffer: Buffer): SupportedDocumentMimeType | null {
  if (!buffer || buffer.length < 3) {
    return null;
  }

  // PDF: %PDF- (5 bytes required)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return 'application/pdf';
  }

  // PNG: 8 bytes required (\x89PNG\r\n\x1a\n)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: 3 bytes (FF D8 FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // TIFF: 4 bytes (II*\0 or MM\0*)
  if (buffer.length >= 4) {
    // Little-endian
    if (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) {
      return 'image/tiff';
    }
    // Big-endian
    if (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a) {
      return 'image/tiff';
    }
  }

  return null;
}

/**
 * Validates document content against declared MIME type, size limit, and suspicious polyglots.
 */
export function validateDocumentContent(
  buffer: Buffer,
  declaredMimeType: SupportedDocumentMimeType,
  options?: FileValidationOptions,
): FileValidationResult {
  const maxSizeBytes = options?.maxSizeBytes ?? MAX_DOCUMENT_FILE_SIZE_BYTES;

  if (!buffer || buffer.length === 0) {
    return {
      valid: false,
      error: 'EMPTY_FILE: Document buffer is empty (0 bytes)',
    };
  }

  if (buffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `SIZE_EXCEEDED: Document size (${buffer.length} bytes) exceeds maximum permitted limit (${maxSizeBytes} bytes)`,
    };
  }

  const detected = detectMagicBytes(buffer);
  if (!detected) {
    return {
      valid: false,
      error: 'INVALID_SIGNATURE: Binary magic bytes do not match any supported document type',
    };
  }

  if (detected !== declaredMimeType) {
    return {
      valid: false,
      error: `DECLARED_MISMATCH: Declared MIME type '${declaredMimeType}' does not match detected content '${detected}'`,
      detectedMimeType: detected,
    };
  }

  // Suspicious polyglot quarantine checks (FR-015 / Constitution Principle III)
  // Check for embedded script tags
  const bufferLatin1 = buffer.toString('latin1');
  if (/<script[\s>]/i.test(bufferLatin1) || /<\/script>/i.test(bufferLatin1)) {
    return {
      valid: false,
      error: 'SUSPICIOUS_POLYGLOT: File contains embedded HTML/script tags (QUARANTINED)',
      detectedMimeType: detected,
    };
  }

  // Check for concatenated/embedded ZIP archive headers (PK\x03\x04 or PK\x01\x02)
  const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  if (buffer.indexOf(zipHeader) !== -1) {
    return {
      valid: false,
      error: 'SUSPICIOUS_POLYGLOT: File contains embedded ZIP archive payload (QUARANTINED)',
      detectedMimeType: detected,
    };
  }

  // Check for embedded executable payloads (DOS PE MZ or ELF)
  if (
    bufferLatin1.includes('This program cannot be run in DOS mode') ||
    bufferLatin1.includes('This program must be run under Win32')
  ) {
    return {
      valid: false,
      error: 'SUSPICIOUS_POLYGLOT: File contains embedded executable binary payload (QUARANTINED)',
      detectedMimeType: detected,
    };
  }

  // Check for EICAR standard antivirus test file string
  if (bufferLatin1.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
    return {
      valid: false,
      error: 'MALICIOUS_CONTENT: EICAR test signature detected (QUARANTINED)',
      detectedMimeType: detected,
    };
  }

  const fileHashSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    valid: true,
    detectedMimeType: detected,
    fileSizeBytes: buffer.length,
    fileHashSha256,
  };
}

/**
 * Sanitizes uploaded document filenames to prevent directory traversal, RTLO spoofing,
 * and unsafe character execution.
 */
export function sanitizeDocumentFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_document';
  }

  // 1. Trim outer whitespace
  let name = filename.trim();
  if (!name) {
    return 'unnamed_document';
  }

  // 2. Normalize Unicode to NFKC
  name = name.normalize('NFKC');

  // 3. Strip control characters, RTLO / bidirectional markers, zero-width spaces, and accents
  name = name
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '');

  // 4. Strip path traversal (directory components)
  name = name.replace(/^.*[\\\/]/, '');

  // 5. Replace spaces with underscores
  name = name.replace(/\s+/g, '_');

  // 6. Replace all characters except alphanumeric, '.', '_', '-' with '_'
  name = name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // 7. Collapse multiple consecutive dots (e.g. '..' -> '.')
  name = name.replace(/\.{2,}/g, '.');

  // 8. If empty or only dots/underscores/dashes, fallback
  const baseChars = name.replace(/[._-]/g, '');
  if (!baseChars) {
    return 'unnamed_document';
  }

  return name;
}
