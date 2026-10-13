import { randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleCandidateNotes,
  createDrizzleCandidateSearch,
  createDrizzleCandidates,
  createDrizzleCvExtractions,
  createDrizzleDataExports,
  createDrizzleErasure,
  createDrizzleAuditLog,
  createDrizzleJobs,
  createDrizzleMemberDirectory,
  createDrizzleMessages,
  createDrizzleNotifications,
  createDrizzleOrganizationDirectory,
  createDrizzleRetentionRuns,
  type FileStorage,
  type OrganizationExportDeps,
  type RetentionDeps,
  type TaskQueue,
} from '@tt/core';
import type { Db } from '@tt/db';
import { zipWriterFactory } from '@tt/providers';

export interface PrivacyWorkerDeps {
  readonly retention: RetentionDeps;
  readonly organizationExport: OrganizationExportDeps;
}

export interface PrivacyWiring {
  readonly db: Db;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
}

/** Retention and organization export on Postgres and S3. */
export function createPrivacyWorkerDeps({ db, files, queue }: PrivacyWiring): PrivacyWorkerDeps {
  const clock = { newId: randomUUID, now: () => new Date() };
  const jobs = createDrizzleJobs(db);
  const applications = createDrizzleApplications(db);
  const dataExports = createDrizzleDataExports(db);
  return {
    retention: {
      applications,
      erasure: createDrizzleErasure(db),
      files,
      queue,
      jobs,
      notifications: createDrizzleNotifications(db),
      members: createDrizzleMemberDirectory(db),
      retentionRuns: createDrizzleRetentionRuns(db),
      dataExports,
      ...clock,
    },
    organizationExport: {
      auditLog: createDrizzleAuditLog(db),
      dataExports,
      organizations: createDrizzleOrganizationDirectory(db),
      jobs,
      candidates: createDrizzleCandidates(db),
      candidateSearch: createDrizzleCandidateSearch(db),
      applications,
      notes: createDrizzleCandidateNotes(db),
      extractions: createDrizzleCvExtractions(db),
      messages: createDrizzleMessages(db),
      files,
      queue,
      zip: zipWriterFactory,
      ...clock,
    },
  };
}
