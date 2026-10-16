import {
  type DrizzleUnitOfWork,
  type CvExtractionDeps,
  type FileStorage,
} from '@candydati/core';
import { createCvExtractor, createMastraGenerator, extractCvText } from '@candydati/providers';

export interface CvExtractionWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  /** Mastra `provider/model`. Absent: only the plain text is extracted. */
  readonly fastModel?: string | undefined;
  /** Extractions per organization and day that may call the model; beyond it only the text is extracted. */
  readonly modelDailyBudget?: number | undefined;
  /** Receives the model failure message only: never the CV text or the model's answer. */
  readonly onModelError: (reason: string) => void;
}

/** Drizzle repositories, S3 storage and the real extractors. The model is optional. */
export function createCvExtractionDeps({ uow, files, fastModel, modelDailyBudget, onModelError }: CvExtractionWiring): CvExtractionDeps {
  const r = uow.repositories;
  const extractor = createCvExtractor({
    ...(fastModel ? { generate: createMastraGenerator(fastModel) } : {}),
    onModelError: (error) => onModelError(error instanceof Error ? error.message : 'unknown'),
  });
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    applications: r.applications,
    extractions: r.extractions,
    files,
    textExtractor: { extractText: extractCvText },
    modelExtractor: fastModel ? { extract: async (text) => (await extractor.extract(text)).data } : null,
    ...(modelDailyBudget === undefined ? {} : { modelDailyBudget }),
    now: () => new Date(),
  };
}
