import { randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type FileStorage,
  type OrganizationExportDeps,
  type RetentionDeps,
  type TaskQueue,
} from '@tt/core';
import { zipWriterFactory } from '@tt/providers';

export interface PrivacyWorkerDeps {
  readonly retention: RetentionDeps;
  readonly organizationExport: OrganizationExportDeps;
}

export interface PrivacyWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
}

/** Retention and organization export on Postgres and S3. */
export function createPrivacyWorkerDeps({ uow, files, queue }: PrivacyWiring): PrivacyWorkerDeps {
  const r = uow.repositories;
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    retention: {
      applications: r.applications,
      erasure: r.erasure,
      files,
      queue,
      jobs: r.jobs,
      notifications: r.notifications,
      members: r.members,
      retentionRuns: r.retentionRuns,
      dataExports: r.dataExports,
      ...clock,
    },
    organizationExport: {
      auditLog: r.auditLog,
      transaction: uow.transaction,
      dataExports: r.dataExports,
      organizations: r.organizations,
      jobs: r.jobs,
      candidates: r.candidates,
      candidateSearch: r.candidateSearch,
      applications: r.applications,
      notes: r.notes,
      extractions: r.extractions,
      messages: r.messages,
      feedbackRequests: r.feedbackRequests,
      interviewFeedback: r.interviewFeedback,
      files,
      queue,
      zip: zipWriterFactory,
      ...clock,
    },
  };
}
