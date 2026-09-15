import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import {
  MockExtractionProvider,
  OpenAIExtractionProvider,
  AnthropicExtractionProvider,
  getExtractionProvider,
} from '../../../src/modules/ingestion/extraction-provider.js';
import { DefaultTextExtractor } from '../../../src/modules/ingestion/text-extractor.js';
import { UnsupportedOcrProvider } from '../../../src/modules/ingestion/ocr-provider.js';
import { ProvisionalExtractionResultSchema } from '@renewalradar/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePdfPath = path.resolve(__dirname, '../../fixtures/us5-vendor-agreement.pdf');
const scannedPdfPath = path.resolve(__dirname, '../../fixtures/us5-scanned-document.pdf');

describe('Document Extraction Providers & Text Extraction (Task T050)', () => {
  describe('MockExtractionProvider determinism', () => {
    it('deterministically extracts labeled fields from us5-vendor-agreement.pdf fixture', async () => {
      const extractor = new DefaultTextExtractor();
      const pdfBuffer = fs.readFileSync(fixturePdfPath);
      const textResult = await extractor.extractText(pdfBuffer, 'application/pdf');
      const text = typeof textResult === 'string' ? textResult : textResult.text;

      const provider = new MockExtractionProvider('mock-test-model');
      const result = await provider.extract(text);

      const parsed = ProvisionalExtractionResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);

      const fieldMap = new Map(result.fields.map((f) => [f.fieldName, f]));

      expect(fieldMap.get('title')?.extractedValue).toBe('Acme Renewal Platform');
      expect(fieldMap.get('type')?.extractedValue).toBe('subscription');
      expect(fieldMap.get('vendorName')?.extractedValue).toBe('Acme Cloud LLC');
      expect(fieldMap.get('amount')?.extractedValue).toBe(12000);
      expect(fieldMap.get('currency')?.extractedValue).toBe('USD');
      expect(fieldMap.get('billingFrequency')?.extractedValue).toBe('annual');
      expect(fieldMap.get('renewalDate')?.extractedValue).toBe('2027-06-30');
      expect(fieldMap.get('expirationDate')?.extractedValue).toBe('2028-06-30');
      expect(fieldMap.get('noticePeriodDays')?.extractedValue).toBe(45);
      expect(fieldMap.get('autoRenew')?.extractedValue).toBe(true);
      expect(fieldMap.get('importantClauses')?.extractedValue).toContain(
        'Written notice is required',
      );

      // Check provenance and confidence
      for (const field of result.fields) {
        expect(field.confidence).toBeGreaterThanOrEqual(0.85);
        expect(field.requiresReview).toBe(false);
        expect(field.sourcePage).toBe(1);
        expect(field.sourceSnippet).toBeDefined();
      }

      expect(result.providerMetadata.provider).toBe('mock');
      expect(result.overallConfidence).toBeGreaterThanOrEqual(0.85);
    });

    it('deterministically extracts contract terms from unstructured text with fallback heuristics', async () => {
      const rawText = `
        Master Services Agreement
        This Agreement is between Initech Global Inc and Salesforce.com, inc.
        Total annual commitment: $24,000 renewing 2027-04-15.
        Requires 60 days prior notice to terminate.
      `;

      const provider = new MockExtractionProvider();
      const result = await provider.extract(rawText);

      expect(result.fields.length).toBeGreaterThan(0);
      const fieldMap = new Map(result.fields.map((f) => [f.fieldName, f]));

      expect(fieldMap.get('amount')?.extractedValue).toBe(24000);
      expect(fieldMap.get('renewalDate')?.extractedValue).toBe('2027-04-15');
      expect(fieldMap.get('noticePeriodDays')?.extractedValue).toBe(60);
    });

    it('instantiates mock provider without requiring API keys', () => {
      const provider = getExtractionProvider('mock');
      expect(provider.name).toBe('mock');
    });
  });

  describe('Scanned/Raster PDF & Image OCR abstraction', () => {
    it('throws explicit unsupported error for image documents when OCR is not configured', async () => {
      const extractor = new DefaultTextExtractor(new UnsupportedOcrProvider());
      const fakeImageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      await expect(extractor.extractText(fakeImageBuffer, 'image/png')).rejects.toThrow(
        /OCR extraction is required/i,
      );
    });

    it('throws explicit unsupported error for scanned PDFs with zero text streams', async () => {
      const minimalPdf = fs.readFileSync(scannedPdfPath);

      const extractor = new DefaultTextExtractor(new UnsupportedOcrProvider());
      await expect(extractor.extractText(minimalPdf, 'application/pdf')).rejects.toThrow(
        /OCR extraction is required/i,
      );
    });
  });

  describe('OpenAIExtractionProvider HTTP adapter', () => {
    it('makes a compliant HTTP request with fixed system prompt and structured JSON response format', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      const mockFetch: typeof fetch = async (url, init) => {
        capturedUrl = url.toString();
        capturedInit = init;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    fields: [
                      {
                        fieldName: 'title',
                        value: 'Datadog Pro Plan',
                        confidence: 0.94,
                        pageNumber: 1,
                        boundingSnippet: 'Datadog Pro',
                      },
                      {
                        fieldName: 'amount',
                        value: 15000,
                        confidence: 0.91,
                        pageNumber: 1,
                        boundingSnippet: '$15,000',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        } as unknown as Response;
      };

      const provider = new OpenAIExtractionProvider({
        apiKey: 'test-openai-key',
        model: 'gpt-4o',
        fetchFn: mockFetch,
        timeoutMs: 5000,
      });

      const result = await provider.extract('Test contract text');

      expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions');
      expect(capturedInit?.method).toBe('POST');
      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-openai-key');

      const body = JSON.parse(capturedInit?.body as string);
      expect(body.model).toBe('gpt-4o');
      expect(body.response_format?.type).toBe('json_object');
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('<document_content>');

      expect(result.overallConfidence).toBeGreaterThan(0.9);
      expect(result.providerMetadata.provider).toBe('openai');
    });

    it('fails clearly when OPENAI_API_KEY is missing', async () => {
      const provider = new OpenAIExtractionProvider({ apiKey: '' });
      await expect(provider.extract('doc')).rejects.toThrow(/OPENAI_API_KEY is not configured/);
    });
  });

  describe('AnthropicExtractionProvider HTTP adapter', () => {
    it('makes a compliant Messages API request with sandboxed document and strips markdown fences', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      const mockFetch: typeof fetch = async (url, init) => {
        capturedUrl = url.toString();
        capturedInit = init;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [
              {
                type: 'text',
                text: '```json\n{"fields": [{"fieldName": "title", "value": "Slack Grid", "confidence": 0.95, "pageNumber": 1, "boundingSnippet": "Slack"}]}\n```',
              },
            ],
          }),
        } as unknown as Response;
      };

      const provider = new AnthropicExtractionProvider({
        apiKey: 'test-anthropic-key',
        model: 'claude-3-5-sonnet-20241022',
        fetchFn: mockFetch,
        timeoutMs: 5000,
      });

      const result = await provider.extract('Agreement text');

      expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('test-anthropic-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');

      const body = JSON.parse(capturedInit?.body as string);
      expect(body.system).toContain('<document_content>');
      expect(result.fields[0]?.extractedValue).toBe('Slack Grid');
      expect(result.providerMetadata.provider).toBe('anthropic');
    });

    it('fails clearly when ANTHROPIC_API_KEY is missing', async () => {
      const provider = new AnthropicExtractionProvider({ apiKey: '' });
      await expect(provider.extract('doc')).rejects.toThrow(/ANTHROPIC_API_KEY is not configured/);
    });
  });
});
