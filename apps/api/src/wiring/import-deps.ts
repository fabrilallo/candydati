import { createHash, randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type ConsentDeps,
  type FileStorage,
  type ImportDeps,
  type ImportSummaryDeps,
  type ImportUndoDeps,
  type TaskQueue,
} from '@tt/core';

export interface ImportWiring {
  /** Upload, preview, mapping, confirm and undo (recruiter side). */
  readonly importDeps: ImportDeps & ImportUndoDeps & ImportSummaryDeps;
  /** The public reconfirmation page. */
  readonly consentDeps: ConsentDeps;
}

export interface ImportInputs {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
}

/** Batches, items and tokens on Postgres. The commit itself runs in the worker. */
export function createImportDeps({ uow, files, queue }: ImportInputs): ImportWiring {
  const r = uow.repositories;
  const core = { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams };
  const clock = { newId: randomUUID, now: () => new Date() };
  const { jobs, candidates, applications, erasure } = r;
  return {
    importDeps: {
      ...core,
      jobs,
      candidates,
      applications,
      erasure,
      imports: r.imports,
      importItems: r.importItems,
      importAnalyses: r.importAnalyses,
      users: r.users,
      files,
      queue,
      ...clock,
    },
    consentDeps: {
      ...core,
      applications,
      erasure,
      files,
      queue,
      candidates,
      jobs,
      organizations: r.organizations,
      privacyNotices: r.privacyNotices,
      consentTokens: r.consentTokens,
      hash: (secret) => createHash('sha256').update(secret).digest('hex'),
      ...clock,
    },
  };
}
