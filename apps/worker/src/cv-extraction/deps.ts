import {
  type DrizzleUnitOfWork,
  type CvExtractionDeps,
  type FileStorage,
} from '@candydati/core';
import { extractCvText } from '@candydati/providers';
import { liveCvExtractor, type FastModel } from './live-extractor.js';

export interface CvExtractionWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  /** The fast model in force at each extraction (null: only the plain text is extracted). */
  readonly fastModel: FastModel;
  /** Extractions per organization and day that may call the model; beyond it only the text is extracted. */
  readonly modelDailyBudget?: number | undefined;
  /** Receives the model failure message only: never the CV text or the model's answer. */
  readonly onModelError: (reason: string) => void;
}

/** Drizzle repositories, S3 storage and the real extractors. The model is optional and read at each extraction. */
export function createCvExtractionDeps({ uow, files, fastModel, modelDailyBudget, onModelError }: CvExtractionWiring): CvExtractionDeps {
  const r = uow.repositories;
  const extractor = liveCvExtractor(fastModel, onModelError);
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    applications: r.applications,
    extractions: r.extractions,
    files,
    textExtractor: { extractText: extractCvText },
    // A getter: the extraction reads it at each run, so the fast model can change without a restart.
    get modelExtractor() {
      const current = extractor();
      return current === null ? null : { extract: async (text: string) => (await current.extract(text)).data };
    },
    ...(modelDailyBudget === undefined ? {} : { modelDailyBudget }),
    now: () => new Date(),
  };
}
