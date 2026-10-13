import { randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleCandidateNotes,
  createDrizzleCandidateSearch,
  createDrizzleCandidates,
  createDrizzleCvExtractions,
  createDrizzleDataExports,
  createDrizzleErasure,
  createDrizzleFeedbackRequests,
  createDrizzleInterviewFeedback,
  createDrizzleJobs,
  createDrizzleMessages,
  createDrizzleOrganizationDirectory,
  createDrizzlePrivacyNotices,
  createDrizzleRetentionRuns,
  type AuditLogRepository,
  type CandidateDeps,
  type CandidateRightsDeps,
  type ConfiguredProviders,
  type FeedbackRecords,
  type FileStorage,
  type OrganizationExportDeps,
  type PrivacyOverviewDeps,
  type TaskQueue,
  type ZipWriterFactory,
} from '@tt/core';
import type { Db } from '@tt/db';

export interface Phase5Deps {
  /** Export, correction, erasure and consent withdrawal of one candidate. */
  readonly rightsDeps: CandidateDeps & CandidateRightsDeps;
  readonly exportDeps: OrganizationExportDeps;
  readonly overviewDeps: PrivacyOverviewDeps;
}

export interface Phase5Inputs {
  readonly db: Db;
  readonly auditLog: AuditLogRepository;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly candidateDeps: CandidateDeps;
  readonly providers: ConfiguredProviders;
  readonly zip: ZipWriterFactory;
  readonly feedbackRecords: FeedbackRecords;
}

export type ExportInputs = Pick<Phase5Inputs, 'db' | 'auditLog' | 'files' | 'queue' | 'zip'> & Partial<Pick<Phase5Inputs, 'feedbackRecords'>>;

/** What the request and the worker task of the organization export need. */
export function createExportDeps({ db, auditLog, files, queue, zip, feedbackRecords }: ExportInputs): OrganizationExportDeps {
  return {
    ...(feedbackRecords ?? { feedbackRequests: createDrizzleFeedbackRequests(db), interviewFeedback: createDrizzleInterviewFeedback(db) }),
    auditLog,
    dataExports: createDrizzleDataExports(db),
    organizations: createDrizzleOrganizationDirectory(db),
    jobs: createDrizzleJobs(db),
    candidates: createDrizzleCandidates(db),
    candidateSearch: createDrizzleCandidateSearch(db),
    applications: createDrizzleApplications(db),
    notes: createDrizzleCandidateNotes(db),
    extractions: createDrizzleCvExtractions(db),
    messages: createDrizzleMessages(db),
    files,
    queue,
    zip,
    newId: randomUUID,
    now: () => new Date(),
  };
}

/** Candidate rights, organization export and the privacy overview on Postgres. */
export function createPhase5Deps({ db, auditLog, files, queue, candidateDeps, providers, zip, feedbackRecords }: Phase5Inputs): Phase5Deps {
  const jobs = createDrizzleJobs(db);
  const applications = createDrizzleApplications(db);
  const candidates = createDrizzleCandidates(db);
  const organizations = createDrizzleOrganizationDirectory(db);
  const privacyNotices = createDrizzlePrivacyNotices(db);
  const retentionRuns = createDrizzleRetentionRuns(db);
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    rightsDeps: { ...candidateDeps, ...feedbackRecords, privacyNotices, erasure: createDrizzleErasure(db) },
    exportDeps: createExportDeps({ db, auditLog, files, queue, zip, feedbackRecords }),
    overviewDeps: { auditLog, applications, candidates, jobs, organizations, privacyNotices, retentionRuns, providers, now: clock.now },
  };
}
