import { createRequire } from 'node:module';
import { OcrProvider, defaultOcrProvider } from './ocr-provider.js';

type PdfParseFn = (buf: Buffer) => Promise<{ numpages: number; text: string }>;
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as PdfParseFn;
export interface TextExtractionResult {
  text: string;
  pageCount: number;
}

export interface TextExtractor {
  extractText(buffer: Buffer, mimeType: string): Promise<string | TextExtractionResult>;
}

export class DefaultTextExtractor implements TextExtractor {
  constructor(private readonly ocrProvider: OcrProvider = defaultOcrProvider) {}

  async extractText(buffer: Buffer, mimeType: string): Promise<TextExtractionResult> {
    if (mimeType === 'application/pdf') {
      let parsed: { numpages: number; text: string };
      try {
        parsed = await pdfParse(buffer);
      } catch (err) {
        throw new Error(`Failed to parse PDF document: ${(err as Error).message}`);
      }

      const extractedText = parsed.text?.trim() ?? '';
      if (extractedText.length === 0) {
        // Scanned PDF with no embedded text streams
        if (this.ocrProvider.isSupported()) {
          const ocrRes = await this.ocrProvider.extractText(buffer, mimeType);
          return { text: ocrRes.text, pageCount: ocrRes.pageCount };
        }
        throw new Error(
          'Scanned PDF detected with no embedded text streams. OCR extraction is required but currently unsupported.',
        );
      }

      return {
        text: extractedText,
        pageCount: parsed.numpages || 1,
      };
    }

    if (mimeType.startsWith('image/')) {
      if (this.ocrProvider.isSupported()) {
        const ocrRes = await this.ocrProvider.extractText(buffer, mimeType);
        return { text: ocrRes.text, pageCount: ocrRes.pageCount };
      }
      throw new Error(
        `OCR extraction is required for raster image format '${mimeType}', but no OCR provider is configured.`,
      );
    }

    throw new Error(`Unsupported document MIME type for text extraction: ${mimeType}`);
  }
}

export const defaultTextExtractor = new DefaultTextExtractor();
