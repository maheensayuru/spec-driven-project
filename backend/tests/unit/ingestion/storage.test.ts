import { describe, it, expect } from 'vitest';
import { StorageService } from '../../../src/modules/ingestion/storage.service.js';

describe('StorageService Binary Magic Bytes Detection', () => {
  it('should detect PDF magic bytes %PDF-', () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const mime = StorageService.validateMagicBytes(pdfBuffer);
    expect(mime).toBe('application/pdf');
  });

  it('should detect PNG magic bytes', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const mime = StorageService.validateMagicBytes(pngBuffer);
    expect(mime).toBe('image/png');
  });

  it('should detect JPEG magic bytes', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const mime = StorageService.validateMagicBytes(jpegBuffer);
    expect(mime).toBe('image/jpeg');
  });

  it('should reject non-matching or arbitrary binary payloads', () => {
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // DOS MZ executable
    const mime = StorageService.validateMagicBytes(exeBuffer);
    expect(mime).toBeNull();

    const emptyBuffer = Buffer.from([]);
    expect(StorageService.validateMagicBytes(emptyBuffer)).toBeNull();
  });
});
