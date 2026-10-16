import type { StructuredGenerator } from '@candydati/ad-quality';
import { cvExtractionSchema, type CvExtraction } from '@candydati/domain';
import { buildCvPrompt } from './prompt.js';
import { dropBirthAndAge } from './privacy-filter.js';

export interface CvExtractionResult {
  readonly data: CvExtraction | null;
  readonly source: 'model' | 'text';
}

export interface CvExtractorOptions {
  /** Without a generator only the plain text is available. */
  readonly generate?: StructuredGenerator | undefined;
  /** Called when the model fails or answers with invalid data; the extractor then falls back to text only. */
  readonly onModelError?: ((error: unknown) => void) | undefined;
}

export interface CvExtractor {
  extract(text: string, language?: string): Promise<CvExtractionResult>;
}

const TEXT_ONLY: CvExtractionResult = { data: null, source: 'text' };

export function createCvExtractor(options: CvExtractorOptions = {}): CvExtractor {
  const { generate, onModelError } = options;
  return {
    async extract(text, language) {
      if (!generate || text.trim() === '') return TEXT_ONLY;
      try {
        const raw = await generate(buildCvPrompt(text, language));
        const data = dropBirthAndAge(cvExtractionSchema.parse(raw));
        return { data, source: 'model' };
      } catch (error) {
        onModelError?.(error);
        return TEXT_ONLY;
      }
    },
  };
}
