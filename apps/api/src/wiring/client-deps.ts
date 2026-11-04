import { randomUUID } from 'node:crypto';
import type {
  CandidateDeps,
  ClientDeps,
  DrizzleUnitOfWork,
  EmailSender,
  FeedbackRecords,
  FileStorage,
  MessagingConfig,
  PublicShortlistDeps,
  ShortlistDeps,
  TaskQueue,
  TimelineDeps,
} from '@candydati/core';
import { newConversationToken } from '@candydati/providers';
import { hashSecret } from './hr-deps.js';

export interface ClientWiring {
  readonly clientDeps: ClientDeps;
  readonly shortlistDeps: ShortlistDeps;
  /** The public shortlist page: a client contact with a link, no session. */
  readonly publicShortlistDeps: PublicShortlistDeps;
  /** The timeline of an application: the candidate repositories, the submitted feedback and the shortlists it was in. */
  readonly timelineDeps: TimelineDeps;
}

export interface ClientInputs {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  readonly onMailError: (error: unknown) => void;
  readonly candidateDeps: CandidateDeps;
  readonly feedback: FeedbackRecords;
}

/** Clients of an agency and their shortlists (PRODUCT.md §3.5), on Postgres; sender, storage and queue are injected. */
export function createClientDeps({ uow, files, queue, sender, config, onMailError, candidateDeps, feedback }: ClientInputs): ClientWiring {
  const r = uow.repositories;
  const core = { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams };
  const clock = { newId: randomUUID, now: () => new Date() };
  const clientDeps: ClientDeps = { ...core, clients: r.clients, jobClients: r.jobClients, jobs: r.jobs, organizationSettings: r.organizationSettings, ...clock };
  const shortlistDeps: ShortlistDeps = {
    ...clientDeps,
    shortlists: r.shortlists,
    applications: r.applications,
    candidates: r.candidates,
    notes: r.notes,
    organizations: r.organizations,
    conversations: r.conversations,
    messages: r.messages,
    queue,
    files,
    sender,
    config,
    newToken: newConversationToken,
    hash: hashSecret,
    onError: onMailError,
  };
  const { auditLog, transaction, jobTeams, shortlists, clients, jobs, applications, candidates, notes, organizations, hash, now } = shortlistDeps;
  return {
    clientDeps,
    shortlistDeps,
    // jobTeams: which stages are restricted. Without it every note written at a stage would be dropped (fail closed).
    publicShortlistDeps: { auditLog, transaction, jobTeams, shortlists, clients, jobs, applications, candidates, notes, organizations, files, hash, now },
    timelineDeps: { ...candidateDeps, ...feedback, shortlists, clients },
  };
}
