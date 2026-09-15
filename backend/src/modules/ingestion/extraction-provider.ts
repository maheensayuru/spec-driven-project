import {
  ExtractionProviderName,
  ProvisionalExtractionResult,
  ExtractedFieldItem,
  ExtractableFieldName,
} from '@renewalradar/shared';
import { env } from '../../config/env.js';
import {
  getExtractionSystemPrompt,
  buildDocumentExtractionPrompt,
  validateProviderExtractionPayload,
  evaluateConfidenceThresholds,
  ExtractedRawField,
} from './prompt.sanitizer.js';

export interface DocumentExtractionProvider {
  readonly name: ExtractionProviderName;
  extract(
    documentText: string,
    options?: { signal?: AbortSignal },
  ): Promise<ProvisionalExtractionResult>;
}

export interface ProviderHttpOptions {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Deterministic Mock Extraction Provider.
 * Parses labeled fields (Title, Type, Vendor, Amount, Currency, Billing Frequency,
 * Renewal Date, Expiration Date, Notice Period Days, Auto Renew, Important Clauses)
 * as found in canonical fixtures like us5-vendor-agreement.pdf, or extracts
 * common contract terms deterministically.
 */
export class MockExtractionProvider implements DocumentExtractionProvider {
  readonly name: ExtractionProviderName = 'mock';

  constructor(private readonly model: string = 'mock-model') {}

  async extract(
    documentText: string,
    _options?: { signal?: AbortSignal },
  ): Promise<ProvisionalExtractionResult> {
    const startTime = Date.now();
    const rawFields: ExtractedRawField[] = [];

    // 1. Look for explicit labeled fields (e.g. fixture us5-vendor-agreement.pdf)
    const labelPatterns: Array<{
      field: ExtractableFieldName;
      regex: RegExp;
      parser: (val: string) => string | number | boolean;
      confidence: number;
    }> = [
      {
        field: 'title',
        regex: /(?:^|\n)\s*Title:\s*([^\n]+)/i,
        parser: (v) => v.trim(),
        confidence: 0.95,
      },
      {
        field: 'type',
        regex: /(?:^|\n)\s*Type:\s*([^\n]+)/i,
        parser: (v) => v.trim().toLowerCase(),
        confidence: 0.92,
      },
      {
        field: 'vendorName',
        regex: /(?:^|\n)\s*Vendor(?:\s*Name)?:\s*([^\n]+)/i,
        parser: (v) => v.trim(),
        confidence: 0.94,
      },
      {
        field: 'amount',
        regex: /(?:^|\n)\s*Amount:\s*([$0-9.,]+)/i,
        parser: (v) => parseFloat(v.replace(/[^0-9.]/g, '')) || 0,
        confidence: 0.93,
      },
      {
        field: 'currency',
        regex: /(?:^|\n)\s*Currency:\s*([A-Za-z]{3})/i,
        parser: (v) => v.trim().toUpperCase(),
        confidence: 0.95,
      },
      {
        field: 'billingFrequency',
        regex: /(?:^|\n)\s*Billing Frequency:\s*([^\n]+)/i,
        parser: (v) => v.trim().toLowerCase(),
        confidence: 0.91,
      },
      {
        field: 'renewalDate',
        regex: /(?:^|\n)\s*Renewal Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
        parser: (v) => v.trim(),
        confidence: 0.94,
      },
      {
        field: 'expirationDate',
        regex: /(?:^|\n)\s*Expiration Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
        parser: (v) => v.trim(),
        confidence: 0.9,
      },
      {
        field: 'noticePeriodDays',
        regex: /(?:^|\n)\s*Notice Period Days:\s*([0-9]+)/i,
        parser: (v) => parseInt(v.trim(), 10) || 30,
        confidence: 0.88,
      },
      {
        field: 'autoRenew',
        regex: /(?:^|\n)\s*Auto Renew:\s*(true|false)/i,
        parser: (v) => v.trim().toLowerCase() === 'true',
        confidence: 0.96,
      },
      {
        field: 'importantClauses',
        regex: /(?:^|\n)\s*Important Clauses:\s*([^\n]+)/i,
        parser: (v) => v.trim(),
        confidence: 0.85,
      },
    ];

    for (const item of labelPatterns) {
      const match = documentText.match(item.regex);
      if (match && match[1]) {
        const snippet = match[0].trim();
        rawFields.push({
          fieldName: item.field,
          value: item.parser(match[1]),
          confidence: item.confidence,
          pageNumber: 1,
          boundingSnippet: snippet,
        });
      }
    }

    // 2. If labeled fields were sparse, perform heuristic extraction
    if (rawFields.length === 0) {
      // Heuristic title
      const lines = documentText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const titleCandidate = lines[0] || 'Standard Vendor Agreement';
      rawFields.push({
        fieldName: 'title',
        value: titleCandidate.slice(0, 100),
        confidence: 0.85,
        pageNumber: 1,
        boundingSnippet: titleCandidate.slice(0, 200),
      });

      // Heuristic vendor
      const vendorMatch = documentText.match(
        /(?:between\s+[A-Za-z0-9\s.,]+?\s+and\s+)([A-Za-z0-9\s.,]+?)(?:,|\.|\n|$)/i,
      );
      if (vendorMatch && vendorMatch[1]) {
        rawFields.push({
          fieldName: 'vendorName',
          value: vendorMatch[1].trim(),
          confidence: 0.86,
          pageNumber: 1,
          boundingSnippet: vendorMatch[0].trim(),
        });
      } else {
        rawFields.push({
          fieldName: 'vendorName',
          value: 'Acme Counterparty Inc.',
          confidence: 0.7, // low confidence -> triggers human review
          pageNumber: 1,
          boundingSnippet: 'Contract Party',
        });
      }

      // Heuristic amount
      const amountMatch = documentText.match(/\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
      if (amountMatch && amountMatch[1]) {
        const parsedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
        rawFields.push({
          fieldName: 'amount',
          value: parsedAmount,
          confidence: 0.89,
          pageNumber: 1,
          boundingSnippet: amountMatch[0],
        });
        rawFields.push({
          fieldName: 'currency',
          value: 'USD',
          confidence: 0.95,
          pageNumber: 1,
          boundingSnippet: '$',
        });
      } else {
        rawFields.push({
          fieldName: 'amount',
          value: 1000,
          confidence: 0.7,
          pageNumber: 1,
          boundingSnippet: 'Fee',
        });
      }

      // Heuristic renewal date
      const dateMatch = documentText.match(/\b(20[2-3][0-9]-[0-1][0-9]-[0-3][0-9])\b/);
      if (dateMatch && dateMatch[1]) {
        rawFields.push({
          fieldName: 'renewalDate',
          value: dateMatch[1],
          confidence: 0.88,
          pageNumber: 1,
          boundingSnippet: dateMatch[0],
        });
      } else {
        rawFields.push({
          fieldName: 'renewalDate',
          value: '2027-01-01',
          confidence: 0.65,
          pageNumber: 1,
          boundingSnippet: 'Renewal term',
        });
      }

      // Heuristic notice period
      const noticeMatch = documentText.match(/([0-9]+)\s*days?\s*(?:prior\s*)?notice/i);
      if (noticeMatch && noticeMatch[1]) {
        rawFields.push({
          fieldName: 'noticePeriodDays',
          value: parseInt(noticeMatch[1], 10),
          confidence: 0.86,
          pageNumber: 1,
          boundingSnippet: noticeMatch[0],
        });
      } else {
        rawFields.push({
          fieldName: 'noticePeriodDays',
          value: 30,
          confidence: 0.75,
          pageNumber: 1,
          boundingSnippet: '30 days',
        });
      }

      // Default type and autoRenew
      rawFields.push({
        fieldName: 'type',
        value: 'subscription',
        confidence: 0.9,
        pageNumber: 1,
        boundingSnippet: 'subscription',
      });
      rawFields.push({
        fieldName: 'billingFrequency',
        value: 'annual',
        confidence: 0.87,
        pageNumber: 1,
        boundingSnippet: 'annual',
      });
      rawFields.push({
        fieldName: 'autoRenew',
        value: true,
        confidence: 0.92,
        pageNumber: 1,
        boundingSnippet: 'auto-renew',
      });
    }

    const evaluatedFields = evaluateConfidenceThresholds(rawFields);
    const sumConfidence = evaluatedFields.reduce((acc, f) => acc + f.confidence, 0);
    const overallConfidence =
      evaluatedFields.length > 0
        ? Math.round((sumConfidence / evaluatedFields.length) * 100) / 100
        : 0;

    const payload: ProvisionalExtractionResult = {
      fields: evaluatedFields,
      overallConfidence,
      providerMetadata: {
        provider: 'mock',
        model: this.model,
        durationMs: Math.max(1, Date.now() - startTime),
      },
    };

    return validateProviderExtractionPayload(payload);
  }
}

/**
 * OpenAI Chat Completions extraction provider adapter.
 * Uses structured JSON object mode with system sandbox boundary and strict schema validation.
 */
export class OpenAIExtractionProvider implements DocumentExtractionProvider {
  readonly name: ExtractionProviderName = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProviderHttpOptions = {}) {
    this.apiKey = options.apiKey || env.OPENAI_API_KEY || '';
    this.model = options.model || env.OPENAI_MODEL || 'gpt-4o';
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs || env.AI_EXTRACTION_TIMEOUT_MS || 60000;
  }

  async extract(
    documentText: string,
    options?: { signal?: AbortSignal },
  ): Promise<ProvisionalExtractionResult> {
    if (!this.apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured. Set OPENAI_API_KEY or switch AI_PROVIDER=mock.',
      );
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await this.fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: getExtractionSystemPrompt(),
            },
            {
              role: 'user',
              content: buildDocumentExtractionPrompt(documentText),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI API request failed with status ${response.status}: ${errorText.slice(0, 500)}`,
        );
      }

      const resBody = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = resBody.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error('OpenAI API returned an empty or invalid completion response');
      }

      const parsedJson = JSON.parse(rawContent);
      const fields = Array.isArray(parsedJson.fields)
        ? evaluateConfidenceThresholds(parsedJson.fields)
        : [];

      const sumConfidence = fields.reduce((acc, f) => acc + f.confidence, 0);
      const overallConfidence =
        fields.length > 0 ? Math.round((sumConfidence / fields.length) * 100) / 100 : 0;

      const provisionalResult: ProvisionalExtractionResult = {
        fields,
        overallConfidence,
        providerMetadata: {
          provider: 'openai',
          model: this.model,
          durationMs: Math.max(1, Date.now() - startTime),
        },
      };

      return validateProviderExtractionPayload(provisionalResult);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Anthropic Messages API extraction provider adapter.
 * Uses system instructions with sandboxed document content and strict response validation.
 */
export class AnthropicExtractionProvider implements DocumentExtractionProvider {
  readonly name: ExtractionProviderName = 'anthropic';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProviderHttpOptions = {}) {
    this.apiKey = options.apiKey || env.ANTHROPIC_API_KEY || '';
    this.model = options.model || env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs || env.AI_EXTRACTION_TIMEOUT_MS || 60000;
  }

  async extract(
    documentText: string,
    options?: { signal?: AbortSignal },
  ): Promise<ProvisionalExtractionResult> {
    if (!this.apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured. Set ANTHROPIC_API_KEY or switch AI_PROVIDER=mock.',
      );
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await this.fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          temperature: 0,
          system: getExtractionSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: buildDocumentExtractionPrompt(documentText),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Anthropic API request failed with status ${response.status}: ${errorText.slice(0, 500)}`,
        );
      }

      const resBody = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const textBlock = resBody.content?.find((c) => c.type === 'text')?.text;
      if (!textBlock) {
        throw new Error('Anthropic API returned an empty message response');
      }

      // Strip potential markdown code fence wrapping ```json ... ```
      const cleanedText = textBlock
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      const parsedJson = JSON.parse(cleanedText);
      const fields = Array.isArray(parsedJson.fields)
        ? evaluateConfidenceThresholds(parsedJson.fields)
        : [];

      const sumConfidence = fields.reduce((acc, f) => acc + f.confidence, 0);
      const overallConfidence =
        fields.length > 0 ? Math.round((sumConfidence / fields.length) * 100) / 100 : 0;

      const provisionalResult: ProvisionalExtractionResult = {
        fields,
        overallConfidence,
        providerMetadata: {
          provider: 'anthropic',
          model: this.model,
          durationMs: Math.max(1, Date.now() - startTime),
        },
      };

      return validateProviderExtractionPayload(provisionalResult);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Factory creating the active DocumentExtractionProvider configured via AI_PROVIDER.
 * Mock provider does not require any credentials.
 */
export function getExtractionProvider(
  providerName?: ExtractionProviderName,
  options?: ProviderHttpOptions,
): DocumentExtractionProvider {
  const selected = providerName || (env.AI_PROVIDER as ExtractionProviderName);
  switch (selected) {
    case 'openai':
      return new OpenAIExtractionProvider(options);
    case 'anthropic':
      return new AnthropicExtractionProvider(options);
    case 'mock':
    default:
      return new MockExtractionProvider(options?.model);
  }
}
