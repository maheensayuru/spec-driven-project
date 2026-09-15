import type { S3Client } from '@aws-sdk/client-s3';
import { describe, it, expect, vi } from 'vitest';
import { StorageService } from '../../../src/modules/ingestion/storage.service.js';
import {
  MockDocumentSecurityScanner,
  documentSecurityScanner,
} from '../../../src/modules/ingestion/document-security.scanner.js';

describe('StorageService Binary Magic Bytes Detection', () => {
  it('should detect PDF magic bytes %PDF-', () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const mime = StorageService.validateMagicBytes(pdfBuffer);
    expect(mime).toBe('application/pdf');
  });

  it('should reject incomplete PDF headers lacking trailing hyphen', () => {
    const incompletePdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x20, 0x31]);
    const mime = StorageService.validateMagicBytes(incompletePdf);
    expect(mime).toBeNull();
  });

  it('should detect PNG magic bytes (8 bytes)', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const mime = StorageService.validateMagicBytes(pngBuffer);
    expect(mime).toBe('image/png');
  });

  it('should detect JPEG magic bytes', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const mime = StorageService.validateMagicBytes(jpegBuffer);
    expect(mime).toBe('image/jpeg');
  });

  it('should detect little-endian and big-endian TIFF magic bytes', () => {
    const tiffLe = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00]);
    expect(StorageService.validateMagicBytes(tiffLe)).toBe('image/tiff');

    const tiffBe = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x08]);
    expect(StorageService.validateMagicBytes(tiffBe)).toBe('image/tiff');
  });

  it('should reject non-matching or arbitrary binary payloads', () => {
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // DOS MZ executable
    const mime = StorageService.validateMagicBytes(exeBuffer);
    expect(mime).toBeNull();

    const emptyBuffer = Buffer.from([]);
    expect(StorageService.validateMagicBytes(emptyBuffer)).toBeNull();

    const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(StorageService.validateMagicBytes(zipBuffer)).toBeNull();
  });
});

describe('StorageService Tenant Partitioning & Presigned URLs', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const docId = '22222222-2222-4222-8222-222222222222';

  it('builds canonical tenant-partitioned storage paths', () => {
    const path = StorageService.getStoragePath(orgId, docId, 'agreement.pdf');
    expect(path).toBe(`documents/${orgId}/${docId}/agreement.pdf`);
  });

  it('generates presigned upload URL bounded by 300 seconds and sanitized path', async () => {
    const result = await StorageService.generatePresignedUploadUrl({
      organizationId: orgId,
      documentId: docId,
      filename: '../../etc/passwd.pdf',
      mimeType: 'application/pdf',
      expiresInSeconds: 600, // Should be clamped to 300
    });

    expect(result.expiresInSeconds).toBe(300);
    expect(result.storagePath).toBe(`documents/${orgId}/${docId}/passwd.pdf`);
    expect(result.uploadUrl).toBeDefined();
    expect(typeof result.uploadUrl).toBe('string');
  });

  it('supports positional arguments for generatePresignedUploadUrl', async () => {
    const result = await StorageService.generatePresignedUploadUrl(
      orgId,
      docId,
      'contract 2026.pdf',
      'application/pdf',
    );

    expect(result.expiresInSeconds).toBe(300);
    expect(result.storagePath).toBe(`documents/${orgId}/${docId}/contract_2026.pdf`);
    expect(result.uploadUrl).toBeDefined();
  });

  it('generates signed inline preview download URL', async () => {
    const storagePath = `documents/${orgId}/${docId}/contract.pdf`;
    const result = await StorageService.generatePresignedDownloadUrl({
      storagePath,
      disposition: 'inline',
      mimeType: 'application/pdf',
    });

    expect(result.expiresInSeconds).toBe(300);
    expect(result.downloadUrl).toBeDefined();
    expect(typeof result.downloadUrl).toBe('string');
  });

  it('generates signed attachment download URL with sanitized filename', async () => {
    const storagePath = `documents/${orgId}/${docId}/contract.pdf`;
    const result = await StorageService.generatePresignedDownloadUrl({
      storagePath,
      disposition: 'attachment',
      filename: 'my document 2026.pdf',
      mimeType: 'application/pdf',
      expiresInSeconds: 120,
    });

    expect(result.expiresInSeconds).toBe(120);
    expect(result.downloadUrl).toBeDefined();
  });
});

describe('StorageService HeadObject and Bounded GetObject', () => {
  it('reads bounded object buffers up to maxBytes', async () => {
    const fakeContent = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    const mockSend = vi.fn().mockResolvedValue({
      ContentLength: fakeContent.length,
      ContentType: 'application/pdf',
      Body: {
        transformToByteArray: async () => new Uint8Array(fakeContent),
      },
    });

    const mockClient = {
      send: mockSend,
    } as unknown as S3Client;

    const customStorage = new StorageService(mockClient, 'test-bucket');

    // Test headObject
    const meta = await customStorage.headObject('documents/org/doc/file.pdf');
    expect(meta.contentLength).toBe(fakeContent.length);
    expect(meta.contentType).toBe('application/pdf');

    // Test getObject bounded within maxBytes (e.g. maxBytes: 50 for 36 byte content)
    const boundedBuffer = await customStorage.getObject('documents/org/doc/file.pdf', {
      maxBytes: 50,
    });
    expect(boundedBuffer.length).toBe(fakeContent.length);

    // Test getObject throws when content exceeds bounded limit
    await expect(
      customStorage.getObject('documents/org/doc/file.pdf', {
        maxBytes: 10,
      }),
    ).rejects.toThrow(/exceeds bounded maximum read limit/);

    // Test getObjectBuffer full
    const fullBuffer = await customStorage.getObjectBuffer('documents/org/doc/file.pdf');
    expect(fullBuffer.length).toBe(fakeContent.length);
  });
});

describe('DocumentSecurityScanner and MockDocumentSecurityScanner', () => {
  const scanner = new MockDocumentSecurityScanner();

  it('reports clean on benign document content', async () => {
    const benignPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
    const result = await scanner.scan(benignPdf, 'contract.pdf');
    expect(result.status).toBe('clean');
    expect(result.threatFound).toBeUndefined();
  });

  it('blocks EICAR standard antivirus test signature honestly', async () => {
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    );
    const result = await scanner.scan(eicar, 'test.pdf');
    expect(result.status).toBe('blocked');
    expect(result.threatFound).toBe('EICAR_STANDARD_TEST_VIRUS');
    expect(result.reason).toContain('EICAR');
  });

  it('blocks DOS PE executable header (MZ)', async () => {
    const dosExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    const result = await scanner.scan(dosExe, 'contract.pdf');
    expect(result.status).toBe('blocked');
    expect(result.threatFound).toBe('EXECUTABLE_DOS_PE_HEADER');
  });

  it('blocks Linux ELF executable header', async () => {
    const elfBin = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
    const result = await scanner.scan(elfBin, 'document.pdf');
    expect(result.status).toBe('blocked');
    expect(result.threatFound).toBe('EXECUTABLE_ELF_HEADER');
  });

  it('blocks embedded HTML script tags in document content', async () => {
    const scriptTag = Buffer.from('%PDF-1.4\n<script>alert("xss")</script>\n%%EOF');
    const result = await scanner.scan(scriptTag, 'statement.pdf');
    expect(result.status).toBe('blocked');
    expect(result.threatFound).toBe('SCRIPT_TAG_INJECTION');
  });

  it('blocks dangerous executable filename extensions', async () => {
    const benignBytes = Buffer.from('%PDF-1.7\nclean content');
    const result = await scanner.scan(benignBytes, 'malicious_payload.exe');
    expect(result.status).toBe('blocked');
    expect(result.threatFound).toBe('DANGEROUS_FILE_EXTENSION_EXE');
  });

  it('provides default export documentSecurityScanner', () => {
    expect(documentSecurityScanner).toBeDefined();
    expect(typeof documentSecurityScanner.scan).toBe('function');
  });
});
