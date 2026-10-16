import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type FileStorage,
  type ImportCommitDeps,
  type TaskQueue,
} from '@candydati/core';
import type { PlatformConfig } from '@candydati/domain';
import { createCvExtractor, createMastraGenerator, newConversationToken, sniffCv, toMessagingConfig, type CvExtractor, type EmailConfig, type ImportAnalysisDeps } from '@candydati/providers';

export interface ImportWorkerWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly platform: PlatformConfig;
  readonly email: EmailConfig;
  /** Mastra `provider/model`. Absent: CVs are read with text and regexes only. */
  readonly fastModel?: string | undefined;
  /** Failure message only: never the CV text or the model's answer. */
  readonly onModelError: (reason: string) => void;
  /** A reconfirmation email that could not be queued. */
  readonly onMailError: (error: unknown) => void;
}

export interface ImportWorkerDeps {
  readonly analysis: ImportAnalysisDeps;
  readonly commit: ImportCommitDeps;
  readonly extractor: CvExtractor | null;
}

/** A 192-bit secret: 32 URL-safe characters, shown only in the reconfirmation link. */
export const newConsentSecret = (): string => randomBytes(24).toString('base64url');
export const hashConsentSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** Drizzle repositories and S3 for the import tasks. The model extractor exists only when `FAST_MODEL` is set. */
export function createImportWorkerDeps({ uow, files, queue, platform, email, fastModel, onModelError, onMailError }: ImportWorkerWiring): ImportWorkerDeps {
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
    extractor: fastModel
      ? createCvExtractor({ generate: createMastraGenerator(fastModel), onModelError: (error) => onModelError(error instanceof Error ? error.message : 'unknown') })
      : null,
    commit: {
      ...analysis,
      auditLog: r.auditLog,
      transaction: uow.transaction,
      jobs: r.jobs,
      applications: r.applications,
      commit: r.commit,
      organizations: r.organizations,
      cvSniffer: sniffCv,
      mail: { conversations: r.conversations, messages: r.messages, config: toMessagingConfig(platform, email), newToken: newConversationToken },
      newSecret: newConsentSecret,
      hash: hashConsentSecret,
      onMailError,
    },
  };
}
