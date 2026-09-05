import { ExtractedFieldItem } from '@renewalradar/shared';

export interface ExtractedRawField {
  fieldName: string;
  value: string | number | boolean | null;
  confidence: number;
  pageNumber?: number;
  boundingSnippet?: string;
}

/**
 * Defense-in-depth prompt sanitizer for untrusted documents (Constitution Principle III & Security Standards).
 * Neutralizes XML injection vectors by escaping closing tags and wrapping the content
 * inside explicit, non-executable <document_content> delimiters.
 */
export function sanitizeDocumentTextForPrompt(rawText: string): string {
  // Normalize and escape closing XML tags that an adversarial contract might use to break out
  const escaped = rawText
    .replace(/<\/document_content>/gi, '&lt;/document_content&gt;')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // remove active scripts
    .trim();

  return `<document_content>\n${escaped}\n</document_content>`;
}

/**
 * Evaluates extracted candidate fields and flags low-confidence fields
 * (confidence < 0.85) as requiring mandatory human review (Clarification 2).
 */
export function evaluateConfidenceThresholds(
  fields: ExtractedRawField[],
  confidenceThreshold = 0.85,
): ExtractedFieldItem[] {
  return fields.map((field) => ({
    fieldName: field.fieldName,
    extractedValue: field.value,
    confidence: field.confidence,
    pageNumber: field.pageNumber,
    boundingSnippet: field.boundingSnippet,
    requiresReview: field.confidence < confidenceThreshold,
  }));
}
