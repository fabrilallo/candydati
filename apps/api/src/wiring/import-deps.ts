import { createHash, randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleCandidates,
  createDrizzleConsentTokens,
  createDrizzleErasure,
  createDrizzleImportAnalyses,
  createDrizzleImportBatches,
  createDrizzleImportItems,
  createDrizzleJobs,
  createDrizzleOrganizationDirectory,
  createDrizzlePrivacyNotices,
  type AuditLogRepository,
  type ConsentDeps,
  type FileStorage,
  type ImportDeps,
  type ImportUndoDeps,
  type TaskQueue,
} from '@tt/core';
import type { Db } from '@tt/db';

export interface ImportWiring {
  /** Upload, preview, mapping, confirm and undo (recruiter side). */
  readonly importDeps: ImportDeps & ImportUndoDeps;
  /** The public reconfirmation page. */
  readonly consentDeps: ConsentDeps;
}

export interface ImportInputs {
  readonly db: Db;
  readonly auditLog: AuditLogRepository;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
}

/** Batches, items and tokens on Postgres. The commit itself runs in the worker. */
export function createImportDeps({ db, auditLog, files, queue }: ImportInputs): ImportWiring {
  const clock = { newId: randomUUID, now: () => new Date() };
  const jobs = createDrizzleJobs(db);
  const candidates = createDrizzleCandidates(db);
  const applications = createDrizzleApplications(db);
  const erasure = createDrizzleErasure(db);
  return {
    importDeps: {
      auditLog,
      jobs,
      candidates,
      applications,
      erasure,
      imports: createDrizzleImportBatches(db),
      importItems: createDrizzleImportItems(db),
      importAnalyses: createDrizzleImportAnalyses(db),
      files,
      queue,
      ...clock,
    },
    consentDeps: {
      auditLog,
      applications,
      erasure,
      files,
      queue,
      candidates,
      jobs,
      organizations: createDrizzleOrganizationDirectory(db),
      privacyNotices: createDrizzlePrivacyNotices(db),
      consentTokens: createDrizzleConsentTokens(db),
      hash: (secret) => createHash('sha256').update(secret).digest('hex'),
      ...clock,
    },
  };
}
