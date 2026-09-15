/**
 * Explicit OCR provider abstraction for scanned PDFs and image documents.
 * In accordance with Constitution Principle III & Security Standards:
 * Scanned PDFs or images return an explicit unsupported/OCR-required permanent state;
 * text is NEVER hallucinated or fabricated.
 */

export interface OcrResult {
  text: string;
  pageCount: number;
  confidence?: number;
}

export interface OcrProvider {
  isSupported(): boolean;
  extractText(buffer: Buffer, mimeType: string): Promise<OcrResult>;
}

export class UnsupportedOcrProvider implements OcrProvider {
  isSupported(): boolean {
    return false;
  }

  async extractText(_buffer: Buffer, mimeType: string): Promise<OcrResult> {
    throw new Error(
      `OCR extraction is required for document of type '${mimeType}', but optical character recognition is not configured. Scanned PDFs and raster images are unsupported without an active OCR provider.`,
    );
  }
}

export const defaultOcrProvider: OcrProvider = new UnsupportedOcrProvider();
