import {
  createDrizzleApplications,
  createDrizzleAuditLog,
  createDrizzleCvExtractions,
  type CvExtractionDeps,
  type FileStorage,
} from '@tt/core';
import type { Db } from '@tt/db';
import { createCvExtractor, createMastraGenerator, extractCvText } from '@tt/providers';

export interface CvExtractionWiring {
  readonly db: Db;
  readonly files: FileStorage;
  /** Mastra `provider/model`. Absent: only the plain text is extracted. */
  readonly fastModel?: string | undefined;
  /** Receives the model failure message only: never the CV text or the model's answer. */
  readonly onModelError: (reason: string) => void;
}

/** Drizzle repositories, S3 storage and the real extractors. The model is optional. */
export function createCvExtractionDeps({ db, files, fastModel, onModelError }: CvExtractionWiring): CvExtractionDeps {
  const extractor = createCvExtractor({
    ...(fastModel ? { generate: createMastraGenerator(fastModel) } : {}),
    onModelError: (error) => onModelError(error instanceof Error ? error.message : 'unknown'),
  });
  return {
    auditLog: createDrizzleAuditLog(db),
    applications: createDrizzleApplications(db),
    extractions: createDrizzleCvExtractions(db),
    files,
    textExtractor: { extractText: extractCvText },
    modelExtractor: fastModel ? { extract: async (text) => (await extractor.extract(text)).data } : null,
    now: () => new Date(),
  };
}
