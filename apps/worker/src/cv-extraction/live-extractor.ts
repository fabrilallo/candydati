import { createCvExtractor, createMastraGenerator, type AiModelRef, type CvExtractor } from '@candydati/providers';

/** The fast model in force at each call (switched on, off or changed from the app); null when off. */
export type FastModel = () => AiModelRef | null;

/**
 * The CV extractor of the fast model in force, built once per distinct model; null while the fast model is off (then
 * only the plain text of a CV is read). Model failures reach `onModelError` as a message only.
 */
export function liveCvExtractor(fastModel: FastModel, onModelError: (reason: string) => void): () => CvExtractor | null {
  let built: { readonly key: string; readonly extractor: CvExtractor } | null = null;
  return () => {
    const model = fastModel();
    if (model === null) return null;
    const key = JSON.stringify(model);
    if (built?.key !== key) {
      built = { key, extractor: createCvExtractor({ generate: createMastraGenerator(model), onModelError: (error) => onModelError(error instanceof Error ? error.message : 'unknown') }) };
    }
    return built.extractor;
  };
}
