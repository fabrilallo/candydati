import { randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type CandidateDeps,
  type CandidateRightsDeps,
  type ConfiguredProviders,
  type FeedbackRecords,
  type FileStorage,
  type OrganizationExportDeps,
  type PrivacyOverviewDeps,
  type TaskQueue,
  type ZipStreamFactory,
} from '@tt/core';

export interface Phase5Deps {
  /** Export, correction, erasure and consent withdrawal of one candidate. */
  readonly rightsDeps: CandidateDeps & CandidateRightsDeps;
  readonly exportDeps: OrganizationExportDeps;
  readonly overviewDeps: PrivacyOverviewDeps;
}

export interface Phase5Inputs {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly candidateDeps: CandidateDeps;
  readonly providers: ConfiguredProviders;
  readonly zip: ZipStreamFactory;
  readonly feedbackRecords: FeedbackRecords;
}

export type ExportInputs = Pick<Phase5Inputs, 'uow' | 'files' | 'queue' | 'zip'> & Partial<Pick<Phase5Inputs, 'feedbackRecords'>>;

/** What the request and the worker task of the organization export need. */
export function createExportDeps({ uow, files, queue, zip, feedbackRecords }: ExportInputs): OrganizationExportDeps {
  const r = uow.repositories;
  return {
    ...(feedbackRecords ?? { feedbackRequests: r.feedbackRequests, interviewFeedback: r.interviewFeedback }),
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: uow.repositories.jobTeams,
    dataExports: r.dataExports,
    organizations: r.organizations,
    jobs: r.jobs,
    candidates: r.candidates,
    candidateSearch: r.candidateSearch,
    applications: r.applications,
    notes: r.notes,
    extractions: r.extractions,
    messages: r.messages,
    files,
    queue,
    zip,
    careersPages: r.careersPages,
    careersMedia: r.careersMedia,
    newId: randomUUID,
    now: () => new Date(),
  };
}

/** Candidate rights, organization export and the privacy overview on Postgres. */
export function createPhase5Deps({ uow, files, queue, candidateDeps, providers, zip, feedbackRecords }: Phase5Inputs): Phase5Deps {
  const r = uow.repositories;
  const core = { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams };
  return {
    rightsDeps: { ...candidateDeps, ...feedbackRecords, privacyNotices: r.privacyNotices, erasure: r.erasure },
    exportDeps: createExportDeps({ uow, files, queue, zip, feedbackRecords }),
    overviewDeps: {
      ...core,
      applications: r.applications,
      candidates: r.candidates,
      jobs: r.jobs,
      organizations: r.organizations,
      privacyNotices: r.privacyNotices,
      retentionRuns: r.retentionRuns,
      providers,
      now: () => new Date(),
    },
  };
}
