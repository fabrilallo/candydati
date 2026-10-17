import type { MessagingConfig } from '@candydati/core';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type FileStorage,
  type ImportCommitDeps,
  type TaskQueue,
} from '@candydati/core';
import { newConversationToken, sniffCv, type CvExtractor, type ImportAnalysisDeps } from '@candydati/providers';
import { liveCvExtractor, type FastModel } from '../cv-extraction/live-extractor.js';

export interface ImportWorkerWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  /** Live: the From and Reply-To domains follow the instance email settings. */
  readonly config: MessagingConfig;
  /** The fast model in force at each analysis (null: contacts from text and patterns only). */
  readonly fastModel: FastModel;
  /** Failure message only: never the CV text or the model's answer. */
  readonly onModelError: (reason: string) => void;
  /** A reconfirmation email that could not be queued. */
  readonly onMailError: (error: unknown) => void;
}

export interface ImportWorkerDeps {
  readonly analysis: ImportAnalysisDeps;
  readonly commit: ImportCommitDeps;
  /** The extractor of the fast model in force, read at each analysis; null while it is off. */
  readonly extractor: () => CvExtractor | null;
}

/** A 192-bit secret: 32 URL-safe characters, shown only in the reconfirmation link. */
export const newConsentSecret = (): string => randomBytes(24).toString('base64url');
export const hashConsentSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** Drizzle repositories and S3 for the import tasks. The model extractor follows the fast model in force (null: off). */
export function createImportWorkerDeps({ uow, files, queue, config, fastModel, onModelError, onMailError }: ImportWorkerWiring): ImportWorkerDeps {
  const r = uow.repositories;
  const analysis: ImportAnalysisDeps = {
    imports: r.imports,
    importItems: r.importItems,
    importAnalyses: r.importAnalyses,
    candidates: r.candidates,
    files,
    queue,
    newId: randomUUID,
    now: () => new Date(),
  };
  return {
    analysis,
    extractor: liveCvExtractor(fastModel, onModelError),
    commit: {
      ...analysis,
      auditLog: r.auditLog,
      transaction: uow.transaction,
      jobs: r.jobs,
      applications: r.applications,
      commit: r.commit,
      organizations: r.organizations,
      cvSniffer: sniffCv,
      mail: { conversations: r.conversations, messages: r.messages, config: config, newToken: newConversationToken },
      newSecret: newConsentSecret,
      hash: hashConsentSecret,
      onMailError,
    },
  };
}
