import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  validateDocumentContent,
  sanitizeDocumentFilename,
  detectMagicBytes,
} from '../../../src/modules/ingestion/file-validation.service.js';
import type { SupportedDocumentMimeType } from '@renewalradar/shared';

describe('T045: Binary Magic-Bytes MIME Validation & File Sanitization (FR-014 & FR-015)', () => {
  const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 26,214,400 bytes (25 MiB)

  describe('Magic byte detection & signature matching', () => {
    it('detects exact PDF signature with trailing hyphen (%PDF-)', () => {
      const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
      expect(detectMagicBytes(validPdf)).toBe('application/pdf');

      const result = validateDocumentContent(validPdf, 'application/pdf');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.detectedMimeType).toBe('application/pdf');
        expect(result.fileSizeBytes).toBe(validPdf.length);
        expect(result.fileHashSha256).toBe(
          crypto.createHash('sha256').update(validPdf).digest('hex'),
        );
      }
    });

    it('rejects incomplete PDF headers lacking trailing hyphen (%PDF)', () => {
      const incompletePdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x20, 0x31]); // %PDF 1
      expect(detectMagicBytes(incompletePdf)).toBeNull();

      const result = validateDocumentContent(incompletePdf, 'application/pdf');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/INVALID_SIGNATURE|UNSUPPORTED_MIME|DECLARED_MISMATCH/);
      }
    });

    it('detects standard 8-byte PNG signature', () => {
      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      expect(detectMagicBytes(validPng)).toBe('image/png');

      const result = validateDocumentContent(validPng, 'image/png');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.detectedMimeType).toBe('image/png');
      }
    });

    it('detects standard JPEG signature (FF D8 FF)', () => {
      const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      expect(detectMagicBytes(validJpg)).toBe('image/jpeg');

      const result = validateDocumentContent(validJpg, 'image/jpeg');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.detectedMimeType).toBe('image/jpeg');
      }
    });

    it('detects little-endian TIFF signature (II*\\0)', () => {
      const tiffLe = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
      expect(detectMagicBytes(tiffLe)).toBe('image/tiff');

      const result = validateDocumentContent(tiffLe, 'image/tiff');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.detectedMimeType).toBe('image/tiff');
      }
    });

    it('detects big-endian TIFF signature (MM\\0*)', () => {
      const tiffBe = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
      expect(detectMagicBytes(tiffBe)).toBe('image/tiff');

      const result = validateDocumentContent(tiffBe, 'image/tiff');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.detectedMimeType).toBe('image/tiff');
      }
    });
  });

  describe('Declared vs detected mismatch (header & extension not authoritative)', () => {
    it('rejects file declared as PDF when content is JPEG', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = validateDocumentContent(jpegBuffer, 'application/pdf');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/DECLARED_MISMATCH|MIME_MISMATCH/);
        expect(result.detectedMimeType).toBe('image/jpeg');
      }
    });

    it('rejects file declared as PDF when content is an executable (DOS/PE MZ)', () => {
      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // MZ header
      const result = validateDocumentContent(exeBuffer, 'application/pdf');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/INVALID_SIGNATURE|UNSUPPORTED_MIME|DECLARED_MISMATCH/);
      }
    });

    it('rejects file declared as PDF when content is HTML script', () => {
      const htmlBuffer = Buffer.from('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>');
      const result = validateDocumentContent(htmlBuffer, 'application/pdf');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/INVALID_SIGNATURE|UNSUPPORTED_MIME|DECLARED_MISMATCH/);
      }
    });

    it('rejects file declared as PNG when content is PDF', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const result = validateDocumentContent(pdfBuffer, 'image/png');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/DECLARED_MISMATCH|MIME_MISMATCH/);
      }
    });
  });

  describe('Truncated, empty, and unsupported buffers', () => {
    it('rejects empty buffer gracefully', () => {
      const empty = Buffer.alloc(0);
      expect(detectMagicBytes(empty)).toBeNull();

      const result = validateDocumentContent(empty, 'application/pdf');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/EMPTY_FILE|INVALID_SIGNATURE/);
      }
    });

    it('rejects truncated signatures shorter than required magic bytes without error', () => {
      const truncated1 = Buffer.from([0x25]);
      const truncated2 = Buffer.from([0x25, 0x50]);
      const truncated3 = Buffer.from([0x25, 0x50, 0x44]);
      const truncatedPng = Buffer.from([0x89, 0x50, 0x4e]);

      expect(detectMagicBytes(truncated1)).toBeNull();
      expect(detectMagicBytes(truncated2)).toBeNull();
      expect(detectMagicBytes(truncated3)).toBeNull();
      expect(detectMagicBytes(truncatedPng)).toBeNull();

      const result = validateDocumentContent(truncated3, 'application/pdf');
      expect(result.valid).toBe(false);
    });

    it('rejects unsupported file types (ZIP / DOCX / ELF / GIF)', () => {
      const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK..
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // .ELF
      const gifBuffer = Buffer.from('GIF89a');

      expect(detectMagicBytes(zipBuffer)).toBeNull();
      expect(detectMagicBytes(elfBuffer)).toBeNull();
      expect(detectMagicBytes(gifBuffer)).toBeNull();

      expect(validateDocumentContent(zipBuffer, 'application/pdf').valid).toBe(false);
      expect(validateDocumentContent(elfBuffer, 'application/pdf').valid).toBe(false);
      expect(validateDocumentContent(gifBuffer, 'image/png').valid).toBe(false);
    });
  });

  describe('Suspicious polyglot content quarantine', () => {
    it('quarantines PDF containing embedded executable payload or script tags', () => {
      const polyglotScript = Buffer.concat([
        Buffer.from('%PDF-1.4\n'),
        Buffer.from('<script>evilPayload()</script>\n'),
        Buffer.from('%%EOF'),
      ]);

      const result = validateDocumentContent(polyglotScript, 'application/pdf');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/SUSPICIOUS_POLYGLOT|MALICIOUS_CONTENT|QUARANTINED/);
      }
    });

    it('quarantines PDF concatenated with ZIP archive headers', () => {
      const polyglotZip = Buffer.concat([
        Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), // embedded ZIP
      ]);

      const result = validateDocumentContent(polyglotZip, 'application/pdf');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/SUSPICIOUS_POLYGLOT|MALICIOUS_CONTENT|QUARANTINED/);
      }
    });
  });

  describe('25 MiB size boundaries and overflow (FR-014)', () => {
    it('accepts valid PDF exactly at 25 MiB boundary', () => {
      const header = Buffer.from('%PDF-1.7\n');
      const boundaryBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES);
      header.copy(boundaryBuffer);

      const result = validateDocumentContent(boundaryBuffer, 'application/pdf', {
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
      });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.fileSizeBytes).toBe(MAX_FILE_SIZE_BYTES);
      }
    });

    it('rejects PDF exceeding 25 MiB by 1 byte', () => {
      const header = Buffer.from('%PDF-1.7\n');
      const overflowBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
      header.copy(overflowBuffer);

      const result = validateDocumentContent(overflowBuffer, 'application/pdf', {
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/SIZE_EXCEEDED|MAX_SIZE_EXCEEDED/);
      }
    });

    it('rejects non-positive sizes', () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = validateDocumentContent(emptyBuffer, 'application/pdf');
      expect(result.valid).toBe(false);
    });
  });

  describe('Filename sanitization & path traversal defense', () => {
    it('neutralizes directory traversal attempts', () => {
      expect(sanitizeDocumentFilename('../../../../etc/passwd')).not.toContain('..');
      expect(sanitizeDocumentFilename('../../../../etc/passwd')).not.toContain('/');
      expect(sanitizeDocumentFilename('..\\..\\windows\\system32\\calc.exe')).not.toContain('\\');
      expect(sanitizeDocumentFilename('/root/secret/contract.pdf')).not.toMatch(/^\//);
      expect(sanitizeDocumentFilename('folder/subfolder/agreement.pdf')).not.toContain('/');
    });

    it('normalizes Unicode characters and strips dangerous control characters', () => {
      // NFKC normalization: decomposed é (e + acute \u0301)
      const decomposed = 're\u0301sume\u0301.pdf';
      const sanitized = sanitizeDocumentFilename(decomposed);
      expect(sanitized).not.toContain('\u0301');

      // Strip null byte and control characters
      const nullByte = 'contract\u0000.pdf';
      expect(sanitizeDocumentFilename(nullByte)).not.toContain('\u0000');

      // Neutralize Right-to-Left Override (RTLO) extension spoofing
      const rtloSpoof = 'contract\u202Efdp.exe'; // \u202E causes visual reversal
      const rtloSanitized = sanitizeDocumentFilename(rtloSpoof);
      expect(rtloSanitized).not.toContain('\u202E');

      // Strip zero-width characters
      const zeroWidth = 'my\u200Bcontract\u200D.pdf';
      const zwSanitized = sanitizeDocumentFilename(zeroWidth);
      expect(zwSanitized).not.toContain('\u200B');
      expect(zwSanitized).not.toContain('\u200D');
    });

    it('produces safe filename outputs preserving extension and replacing unsafe chars', () => {
      expect(sanitizeDocumentFilename('Acme Master Services Agreement 2026.pdf')).toBe(
        'Acme_Master_Services_Agreement_2026.pdf',
      );
      expect(sanitizeDocumentFilename('contract$$%#@!.pdf')).toMatch(/^[a-zA-Z0-9._-]+$/);
      expect(sanitizeDocumentFilename('   trimmed_name.png   ')).toBe('trimmed_name.png');

      // Fallback for empty or dotfile names
      expect(sanitizeDocumentFilename('')).toMatch(/^document_[a-zA-Z0-9_-]+|unnamed_document/);
      expect(sanitizeDocumentFilename('.')).toMatch(/^document_[a-zA-Z0-9_-]+|unnamed_document/);
      expect(sanitizeDocumentFilename('..')).toMatch(/^document_[a-zA-Z0-9_-]+|unnamed_document/);
    });
  });
});
