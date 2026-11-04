import {
  DAY_MS,
  SHORTLIST_TOKEN_TTL_DAYS,
  shortlistInputSchema,
  shortlistStatus,
  type Application,
  type Candidate,
  type Client,
  type ClientAnswer,
  type ClientShortlist,
  type ClientShortlistItem,
  type Job,
  type ShortlistStatus,
} from '@candydati/domain';
import { z } from 'zod';
import type { ShortlistDeps } from '../../client-ports.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { afterCommitOrNow } from '../../transaction.js';
import { requireAgency, defineShortlistUseCase } from './define.js';
import { prepareCandidates, type PreparedCandidate } from './shortlist-candidates.js';
import { queueProfileNotice, sendShortlistEmail } from './shortlist-mail.js';

export interface ShortlistItemView {
  readonly id: string;
  readonly applicationId: string;
  readonly candidateName: string;
  readonly shareCv: boolean;
  readonly sharedNoteCount: number;
  readonly answer: ClientAnswer | null;
  readonly answerReason: string | null;
  readonly answeredAt: Date | null;
  readonly candidateNotified: boolean;
}

/** What the recruiter sees of a shortlist: never the link, never the hash. */
export interface ShortlistView {
  readonly id: string;
  readonly jobId: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly recipientName: string;
  readonly recipientEmail: string;
  readonly message: string | null;
  readonly status: ShortlistStatus;
  readonly remindersSent: number;
  readonly firstOpenedAt: Date | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly items: readonly ShortlistItemView[];
}

const fullName = (candidate: Pick<Candidate, 'firstName' | 'lastName'> | undefined): string => (candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : '');

export function toShortlistView(shortlist: ClientShortlist, items: readonly ClientShortlistItem[], clientName: string, names: Readonly<Record<string, string>>, now: Date): ShortlistView {
  return {
    id: shortlist.id,
    jobId: shortlist.jobId,
    clientId: shortlist.clientId,
    clientName,
    recipientName: shortlist.recipientName,
    recipientEmail: shortlist.recipientEmail,
    message: shortlist.message,
    status: shortlistStatus(shortlist, items, now),
    remindersSent: shortlist.remindersSent,
    firstOpenedAt: shortlist.firstOpenedAt,
    createdAt: shortlist.createdAt,
    expiresAt: shortlist.expiresAt,
    revokedAt: shortlist.revokedAt,
    items: items.map((item) => ({
      id: item.id,
      applicationId: item.applicationId,
      candidateName: names[item.applicationId] ?? '',
      shareCv: item.shareCv,
      sharedNoteCount: item.sharedNoteIds.length,
      answer: item.answer,
      answerReason: item.answerReason,
      answeredAt: item.answeredAt,
      candidateNotified: item.candidateNotifiedAt !== null,
    })),
  };
}

/** Candidate names by application id, for the recruiter's view (the applications are in the actor's scope). */
async function namesOf(deps: ShortlistDeps, organizationId: string, items: readonly ClientShortlistItem[]): Promise<Readonly<Record<string, string>>> {
  const applications: Application[] = [];
  for (const id of [...new Set(items.map((item) => item.applicationId))]) {
    const application = await deps.applications.findById(organizationId, id);
    if (application) applications.push(application);
  }
  const candidates = await deps.candidates.findByIds(organizationId, [...new Set(applications.map((a) => a.candidateId))]);
  return Object.fromEntries(applications.map((a) => [a.id, fullName(candidates.find((c) => c.id === a.candidateId))]));
}

async function viewsOf(deps: ShortlistDeps, organizationId: string, shortlists: readonly ClientShortlist[]): Promise<readonly ShortlistView[]> {
  const items = await deps.shortlists.listItems(organizationId, shortlists.map((s) => s.id));
  const names = await namesOf(deps, organizationId, items);
  const clients = await deps.clients.list(organizationId, { includeArchived: true });
  const now = deps.now();
  return shortlists.map((s) => toShortlistView(s, items.filter((i) => i.shortlistId === s.id), clients.find((c) => c.id === s.clientId)?.name ?? '', names, now));
}

interface SendContext {
  readonly job: Job;
  readonly client: Client;
  readonly display: 'named' | 'confidential';
}

async function loadSendContext(deps: ShortlistDeps, organizationId: string, jobId: string): Promise<SendContext> {
  await requireAgency(deps, organizationId);
  const job = await deps.jobs.findById(organizationId, jobId);
  if (!job) throw new NotFoundError('Job not found.');
  if (job.status === 'closed') throw new ConflictError('job_closed');
  const link = await deps.jobClients.findByJob(organizationId, jobId);
  const client = link ? await deps.clients.findById(organizationId, link.clientId) : null;
  if (!link || !client) throw new ConflictError('job_without_client');
  if (client.archivedAt !== null) throw new ConflictError('client_archived');
  return { job, client, display: link.display };
}

/** One notice per candidate, queued with the shortlist. Returns the items whose notice was queued. */
async function notifyCandidates(deps: ShortlistDeps, context: SendContext, prepared: readonly PreparedCandidate[], items: readonly ClientShortlistItem[], sentBy: string) {
  const organization = await deps.organizations.findById(context.job.organizationId);
  if (!organization) throw new NotFoundError('Organization not found.');
  const notified: string[] = [];
  for (const [index, entry] of prepared.entries()) {
    const item = items[index];
    if (!item) continue;
    const queued = await queueProfileNotice(deps, {
      organization,
      job: context.job,
      applicationId: entry.application.id,
      candidate: entry.candidate,
      clientName: context.display === 'named' ? context.client.name : null,
      sharedCv: item.shareCv,
      sharedNotes: item.sharedNoteIds.length > 0,
      sentBy,
    });
    if (queued) notified.push(item.id);
  }
  return { organization, notified };
}

/**
 * Presents candidates of a client job to one contact of the client (PRODUCT.md §3.5). A person does it (never a key or the
 * assistant: `shortlist:send` is machine-forbidden), choosing per candidate whether the CV goes and which notes. In one
 * transaction: the shortlist with only the hash of its secret, and a notice to every candidate saying who saw their
 * profile. After the commit the contact gets the personal link.
 */
export const sendShortlist = defineShortlistUseCase({
  name: 'sendShortlist',
  input: shortlistInputSchema,
  permission: 'shortlist:send',
  audit: {
    action: 'shortlist.sent',
    target: (_input, result: ShortlistView) => ({ type: 'client_shortlist', id: result.id }),
    metadata: (_input, result: ShortlistView) => ({
      jobId: result.jobId,
      clientId: result.clientId,
      candidates: result.items.length,
      sharedCvs: result.items.filter((item) => item.shareCv).length,
      notified: result.items.filter((item) => item.candidateNotified).length,
    }),
  },
  handler: async ({ deps, actor, input }): Promise<ShortlistView> => {
    if (actor.type !== 'user' || actor.id === null) throw new ForbiddenError();
    const { organizationId } = actor;
    const context = await loadSendContext(deps, organizationId, input.jobId);
    const contact = context.client.contacts.find((c) => c.id === input.contactId);
    if (!contact) throw new ValidationError([{ path: 'contactId', message: 'unknown_contact' }]);
    const prepared = await prepareCandidates(deps, organizationId, context.job.id, input.candidates);
    const secret = deps.newToken();
    const now = deps.now();
    const shortlist: ClientShortlist = {
      id: deps.newId(),
      organizationId,
      jobId: context.job.id,
      clientId: context.client.id,
      recipientContactId: contact.id,
      recipientName: contact.name,
      recipientEmail: contact.email,
      tokenHash: deps.hash(secret),
      message: input.message,
      expiresAt: new Date(now.getTime() + SHORTLIST_TOKEN_TTL_DAYS * DAY_MS),
      revokedAt: null,
      remindersSent: 0,
      lastReminderAt: null,
      firstOpenedAt: null,
      createdBy: actor.id,
      createdAt: now,
    };
    const items: ClientShortlistItem[] = prepared.map((entry, position) => ({
      id: deps.newId(),
      organizationId,
      shortlistId: shortlist.id,
      applicationId: entry.application.id,
      position,
      shareCv: entry.shareCv,
      sharedNoteIds: entry.noteIds,
      answer: null,
      answerReason: null,
      answeredAt: null,
      candidateNotifiedAt: null,
    }));
    await deps.shortlists.create(shortlist, items);
    const { organization, notified } = await notifyCandidates(deps, context, prepared, items, actor.id);
    await deps.shortlists.markCandidateNotified(organizationId, notified, now);
    const stored = items.map((item) => (notified.includes(item.id) ? { ...item, candidateNotifiedAt: now } : item));
    // The link is emailed after the commit: never a link to a shortlist that was rolled back.
    await afterCommitOrNow(deps, async () => void (await sendShortlistEmail(deps, { organization, job: context.job, candidateCount: items.length }, shortlist, secret, false)));
    const names = Object.fromEntries(prepared.map((entry) => [entry.application.id, fullName(entry.candidate)]));
    return toShortlistView(shortlist, stored, context.client.name, names, now);
  },
});

export const listJobShortlists = defineShortlistUseCase({
  name: 'listJobShortlists',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'shortlist:read',
  audit: { skip: 'read-only' },
  handler: async ({ deps, actor, input }): Promise<readonly ShortlistView[]> => {
    if (!(await deps.jobs.findById(actor.organizationId, input.jobId))) throw new NotFoundError('Job not found.');
    return viewsOf(deps, actor.organizationId, await deps.shortlists.listByJob(actor.organizationId, input.jobId));
  },
});

/** Stops the link at once. Answers already given stay. */
export const revokeShortlist = defineShortlistUseCase({
  name: 'revokeShortlist',
  input: z.object({ shortlistId: z.string().min(1) }),
  permission: 'shortlist:send',
  audit: { action: 'shortlist.revoked', target: (input) => ({ type: 'client_shortlist', id: input.shortlistId }) },
  handler: async ({ deps, actor, input }): Promise<ShortlistView> => {
    const shortlist = await deps.shortlists.findById(actor.organizationId, input.shortlistId);
    if (!shortlist) throw new NotFoundError('Shortlist not found.');
    if (!(await deps.shortlists.revoke(actor.organizationId, shortlist.id, deps.now()))) throw new ConflictError('already_revoked');
    const [view] = await viewsOf(deps, actor.organizationId, [{ ...shortlist, revokedAt: deps.now() }]);
    if (!view) throw new NotFoundError('Shortlist not found.');
    return view;
  },
});
