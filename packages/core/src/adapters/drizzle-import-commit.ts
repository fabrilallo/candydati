import type { DbExecutor } from './db-executor.js';
import type { ImportCommitTransaction } from '../import-ports.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidateNotes } from './drizzle-candidate-notes.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleCvExtractions } from './drizzle-cv-extractions.js';
import { createDrizzleConsentTokens, createDrizzleImportBatches, createDrizzleImportItems } from './drizzle-imports.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleStageEvents } from './drizzle-report-history.js';

/** One Postgres transaction per chunk of an import: candidates, applications, extractions, notes, tokens and item status, all or none. */
export function createDrizzleImportCommit(db: DbExecutor): ImportCommitTransaction {
  return {
    run: (work) =>
      db.transaction((tx) =>
        work({
          jobs: createDrizzleJobs(tx),
          imports: createDrizzleImportBatches(tx),
          candidates: createDrizzleCandidates(tx),
          applications: createDrizzleApplications(tx),
          extractions: createDrizzleCvExtractions(tx),
          notes: createDrizzleCandidateNotes(tx),
          stageEvents: createDrizzleStageEvents(tx),
          importItems: createDrizzleImportItems(tx),
          consentTokens: createDrizzleConsentTokens(tx),
        }),
      ),
  };
}
