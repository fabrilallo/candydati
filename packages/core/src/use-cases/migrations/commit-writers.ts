import { jobSlug, placeholderEmail, type Candidate, type CandidateNote, type Job, type Message, type PlannedMigrationPerson } from '@candydati/domain';
import type { MigrationCommitDeps } from '../../migration-commit-ports.js';
import { withStageIds } from '../jobs/shared.js';
import { storeReconfirmationRequest } from '../imports/reconfirmation-request.js';
import { oneLine } from '../messaging/shared.js';
import { applicationsStep } from './commit-applications.js';
import type { MigrationCommitContext } from './commit-context.js';
import { resolveJobs, resolvePeople } from './commit-resolve.js';
import type { CommitDelta, CommitStepWriter, CommitSteps } from './commit-runner.js';

/** Jobs straight in their final status (closed with their date, or draft), the publish rules not applied (Task 3.4). */
async function writeJobs(ctx: MigrationCommitContext, tx: MigrationCommitDeps, from: number, to: number): Promise<CommitDelta> {
  const planned = ctx.plan.jobs.slice(from, to);
  for (const { job, status, closedAt } of planned) {
    const content = ctx.contents.get(job.ref);
    if (!content) throw new Error('migration_job_content_missing');
    const id = ctx.rowId('job', job.ref);
    const createdAt = new Date(job.createdAt);
    const value: Job = {
      id,
      organizationId: ctx.batch.organizationId,
      slug: jobSlug(job.title, id.slice(0, 8)),
      status,
      content: withStageIds(content, ctx.deps.newId),
      quality: null,
      createdBy: ctx.batch.createdBy,
      createdAt,
      updatedAt: ctx.at,
      publishedAt: status === 'closed' ? createdAt : null,
      closedAt,
    };
    await tx.migratedRows.insertJob(ctx.batch.id, value);
  }
  return { jobs: planned.length };
}

function newCandidate(ctx: MigrationCommitContext, person: PlannedMigrationPerson): Candidate {
  const id = ctx.rowId('candidate', person.key);
  const { candidate } = person;
  return {
    id,
    organizationId: ctx.batch.organizationId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: person.email ?? placeholderEmail(id),
    phone: candidate.phone ?? null,
    linkedinUrl: candidate.linkedinUrl ?? null,
    tags: [...candidate.tags],
    talentPool: person.talentPool,
    retentionExpiresAt: person.retentionExpiresAt,
    importBatchId: null,
    createdAt: new Date(candidate.createdAt),
    updatedAt: ctx.at,
  };
}

/** A person whose email is already a candidate's is merged: nothing of the existing profile is overwritten. */
async function writePeople(ctx: MigrationCommitContext, tx: MigrationCommitDeps, from: number, to: number): Promise<CommitDelta> {
  let created = 0;
  let merged = 0;
  for (const person of ctx.plan.people.slice(from, to)) {
    const existing = person.email === null ? null : await tx.candidates.findByEmail(ctx.batch.organizationId, person.email);
    if (existing) {
      merged += 1;
      continue;
    }
    await tx.migratedRows.insertCandidate(ctx.batch.id, newCandidate(ctx, person));
    created += 1;
  }
  return { candidatesCreated: created, candidatesMerged: merged };
}

/** ADR 0008 for people with no consent date: the request is stored now and delivered (`email.send`) once the chunk commits. */
async function writeReconfirmations(ctx: MigrationCommitContext, tx: MigrationCommitDeps, from: number, to: number): Promise<CommitDelta> {
  const chunk = ctx.reconfirmations.slice(from, to);
  const people = await resolvePeople(ctx, tx, chunk.map(({ person }) => person.key));
  const jobs = await resolveJobs(ctx, tx, chunk.map(({ application }) => application.application.jobRef));
  const repos = { consentTokens: tx.consentTokens, conversations: tx.mail.conversations, messages: tx.mail.messages };
  for (const { person, application } of chunk) {
    const job = jobs.get(application.application.jobRef)?.job;
    const candidateId = people.get(person.key);
    if (!job || !candidateId) throw new Error('migration_reference_missing');
    const messageId = await storeReconfirmationRequest(ctx.deps, repos, {
      organization: ctx.organization,
      job: { title: job.content.title, language: job.content.language },
      applicationId: ctx.rowId('application', application.application.ref),
      person: { id: candidateId, firstName: person.candidate.firstName },
      expiresAt: application.retentionExpiresAt,
      at: ctx.at,
    });
    await tx.queue.enqueue('email.send', { organizationId: ctx.batch.organizationId, messageId }, { singletonKey: messageId });
  }
  return { reconfirmationsQueued: chunk.length };
}

/** Notes signed by the member with the author's email, else by the author's name (or the source system's). */
async function writeNotes(ctx: MigrationCommitContext, tx: MigrationCommitDeps, from: number, to: number): Promise<CommitDelta> {
  const chunk = ctx.plan.notes.slice(from, to);
  const people = await resolvePeople(ctx, tx, chunk.map((entry) => entry.personKey));
  const notes = chunk.map(({ index, note, personKey, applicationRef }): CandidateNote => {
    const author = note.authorRef === undefined ? undefined : ctx.authors.get(note.authorRef);
    return {
      id: ctx.rowId('note', String(index)),
      organizationId: ctx.batch.organizationId,
      candidateId: people.get(personKey) ?? '',
      applicationId: applicationRef === null ? null : ctx.rowId('application', applicationRef),
      authorId: author?.authorId ?? null,
      authorName: author?.authorId ? null : (author?.authorName ?? note.authorName ?? ctx.sourceSystem),
      body: note.body,
      createdAt: new Date(note.createdAt),
    };
  });
  await tx.migratedRows.insertNotes(ctx.batch.id, notes);
  return { notes: notes.length };
}

/** Past emails: stored as sent or received, `historical`, never queued and never counted by the caps. */
async function writeMessages(ctx: MigrationCommitContext, tx: MigrationCommitDeps, from: number, to: number): Promise<CommitDelta> {
  const chunk = ctx.plan.messages.slice(from, to);
  const people = await resolvePeople(ctx, tx, chunk.map(({ message }) => ctx.personOfApplication.get(message.applicationRef) ?? ''));
  const messages = chunk.map(({ index, message }): Message => {
    const at = new Date(message.at);
    return {
      id: ctx.rowId('message', String(index)),
      organizationId: ctx.batch.organizationId,
      applicationId: ctx.rowId('application', message.applicationRef),
      candidateId: people.get(ctx.personOfApplication.get(message.applicationRef) ?? '') ?? '',
      direction: message.direction,
      subject: oneLine(message.subject ?? ''),
      bodyText: message.body,
      status: message.direction === 'outbound' ? 'sent' : 'received',
      providerMessageId: null,
      sentBy: null,
      createdAt: at,
      sentAt: at,
      error: null,
      rawText: null,
      unverifiedSender: false,
      inboundMessageId: null,
      historical: true,
    };
  });
  await tx.migratedRows.insertMessages(ctx.batch.id, messages);
  return { messages: messages.length };
}

type Write = (ctx: MigrationCommitContext, tx: MigrationCommitDeps, from: number, to: number) => Promise<CommitDelta>;

const step = (size: number, length: CommitStepWriter['length'], write: Write): CommitStepWriter => ({ size, length, write });

/** The steps in the plan's order (Task 3.4): jobs, people, applications with history, reconfirmations, notes, messages. */
export const COMMIT_STEPS: CommitSteps = {
  jobs: step(50, (ctx) => ctx.plan.jobs.length, writeJobs),
  people: step(200, (ctx) => ctx.plan.people.length, writePeople),
  applications: applicationsStep,
  reconfirm: step(100, (ctx) => ctx.reconfirmations.length, writeReconfirmations),
  notes: step(500, (ctx) => ctx.plan.notes.length, writeNotes),
  messages: step(500, (ctx) => ctx.plan.messages.length, writeMessages),
};
