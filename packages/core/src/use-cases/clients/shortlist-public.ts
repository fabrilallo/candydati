import {
  constantTimeEqual,
  shortlistAnswerSchema,
  type ClientAnswer,
  type ClientShortlist,
  type ClientShortlistItem,
  type Locale,
} from '@candydati/domain';
import { z } from 'zod';
import type { PublicShortlistDeps } from '../../client-ports.js';
import { ConflictError, NotFoundError } from '../../errors.js';
import { definePublicShortlistCommand } from './define.js';

export const SHORTLIST_PAGE_ACTOR_ID = 'shortlist_page';

const tokenInput = z.object({ token: z.string().min(16).max(200) });
const NOT_VALID = 'This link is not valid.';

/**
 * Unknown, expired and revoked links are all "not found": nothing says whether the link ever existed. The stored hash is
 * compared again in constant time on top of the lookup, so no timing tells a prefix of a secret.
 */
async function resolve(deps: PublicShortlistDeps, secret: string): Promise<ClientShortlist> {
  const hash = deps.hash(secret);
  const shortlist = await deps.shortlists.findByTokenHash(hash);
  if (!shortlist || !constantTimeEqual(shortlist.tokenHash, hash)) throw new NotFoundError(NOT_VALID);
  if (shortlist.revokedAt !== null || shortlist.expiresAt <= deps.now()) throw new NotFoundError(NOT_VALID);
  return shortlist;
}

interface Presented {
  readonly item: ClientShortlistItem;
  readonly firstName: string;
  readonly lastName: string;
  readonly hasCv: boolean;
  readonly cv: { readonly key: string; readonly fileName: string; readonly mediaType: string } | null;
  readonly notes: readonly { readonly body: string; readonly at: Date }[];
}

/**
 * The candidates still presentable: an application that was erased, or whose consent was withdrawn, disappears from the
 * page. Only what the recruiter chose is loaded: the CV when shared, the selected notes.
 */
async function presented(deps: PublicShortlistDeps, shortlist: ClientShortlist): Promise<readonly Presented[]> {
  const { organizationId } = shortlist;
  const result: Presented[] = [];
  for (const item of await deps.shortlists.listItems(organizationId, [shortlist.id])) {
    const application = await deps.applications.findById(organizationId, item.applicationId);
    if (!application || application.consentStatus !== 'given') continue;
    const candidate = await deps.candidates.findById(organizationId, application.candidateId);
    if (!candidate) continue;
    const notes = item.sharedNoteIds.length === 0 ? [] : (await deps.notes.listByCandidate(organizationId, candidate.id)).filter((n) => item.sharedNoteIds.includes(n.id));
    const cv = item.shareCv && application.cv !== null && application.cv.key !== '' ? application.cv : null;
    result.push({ item, firstName: candidate.firstName, lastName: candidate.lastName, hasCv: cv !== null, cv, notes: notes.map((n) => ({ body: n.body, at: n.createdAt })) });
  }
  return result;
}

export interface PublicShortlistCandidateView {
  readonly itemId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly hasCv: boolean;
  readonly notes: readonly { readonly body: string; readonly at: Date }[];
  readonly answer: ClientAnswer | null;
  readonly answerReason: string | null;
  readonly answeredAt: Date | null;
}

/** What the client reads: no email, phone, tags, stages, other jobs or internal ids of anyone. */
export interface PublicShortlistView {
  readonly agencyName: string;
  readonly clientName: string;
  readonly recipientName: string;
  readonly jobTitle: string;
  readonly language: Locale;
  readonly message: string | null;
  readonly expiresAt: Date;
  readonly candidates: readonly PublicShortlistCandidateView[];
}

const toCandidateView = (entry: Presented): PublicShortlistCandidateView => ({
  itemId: entry.item.id,
  firstName: entry.firstName,
  lastName: entry.lastName,
  hasCv: entry.hasCv,
  notes: entry.notes,
  answer: entry.item.answer,
  answerReason: entry.item.answerReason,
  answeredAt: entry.item.answeredAt,
});

/** Opens the page. The first opening is recorded (the recruiter sees "opened") and audited once. */
export const getClientShortlist = definePublicShortlistCommand({
  name: 'getClientShortlist',
  input: tokenInput,
  actorId: SHORTLIST_PAGE_ACTOR_ID,
  audit: { skip: 'the first opening is appended by the handler; later ones change nothing' },
  handler: async ({ deps, input, actor }): Promise<PublicShortlistView> => {
    const shortlist = await resolve(deps, input.token);
    const { organizationId } = shortlist;
    const [job, client, organization] = [
      await deps.jobs.findById(organizationId, shortlist.jobId),
      await deps.clients.findById(organizationId, shortlist.clientId),
      await deps.organizations.findById(organizationId),
    ];
    if (!job || !client || !organization) throw new NotFoundError(NOT_VALID);
    if (await deps.shortlists.markOpened(organizationId, shortlist.id, deps.now())) {
      await deps.auditLog.append({ organizationId, actor, action: 'shortlist.opened', target: { type: 'client_shortlist', id: shortlist.id }, metadata: {} });
    }
    return {
      agencyName: organization.name,
      clientName: client.name,
      recipientName: shortlist.recipientName,
      jobTitle: job.content.title,
      language: job.content.language,
      message: shortlist.message,
      expiresAt: shortlist.expiresAt,
      candidates: (await presented(deps, shortlist)).map(toCandidateView),
    };
  },
});

async function requireItem(deps: PublicShortlistDeps, shortlist: ClientShortlist, itemId: string): Promise<Presented> {
  const entry = (await presented(deps, shortlist)).find((p) => p.item.id === itemId);
  if (!entry) throw new NotFoundError('Candidate not found.');
  return entry;
}

/**
 * "Meet at interview" or "not for us", with a short reason, once per candidate. It is recorded on the application's
 * timeline and audit log; it never moves a stage or decides anything: a person at the agency does that (principle 4).
 */
export const answerShortlistCandidate = definePublicShortlistCommand({
  name: 'answerShortlistCandidate',
  input: shortlistAnswerSchema.extend({ token: tokenInput.shape.token }),
  actorId: SHORTLIST_PAGE_ACTOR_ID,
  audit: { skip: 'appended by the handler in the command transaction: the event needs ids the result does not carry' },
  handler: async ({ deps, input, actor }): Promise<PublicShortlistCandidateView> => {
    const shortlist = await resolve(deps, input.token);
    const entry = await requireItem(deps, shortlist, input.itemId);
    if (entry.item.answer !== null) throw new ConflictError('already_answered');
    const at = deps.now();
    const write = { answer: input.answer, reason: input.reason, at };
    if (!(await deps.shortlists.answer(shortlist.organizationId, shortlist.id, entry.item.id, write))) throw new ConflictError('already_answered');
    await deps.auditLog.append({
      organizationId: shortlist.organizationId,
      actor,
      action: 'shortlist.answered',
      target: { type: 'client_shortlist', id: shortlist.id },
      metadata: { applicationId: entry.item.applicationId, answer: input.answer },
    });
    return toCandidateView({ ...entry, item: { ...entry.item, answer: input.answer, answerReason: input.reason, answeredAt: at } });
  },
});

export interface ShortlistCvFile {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mediaType: string;
  readonly inlineable: boolean;
}

/** The CV of one candidate, only when the recruiter shared it; audited as `shortlist.cv_opened` (ids only). */
export const openShortlistCv = definePublicShortlistCommand({
  name: 'openShortlistCv',
  input: z.object({ token: tokenInput.shape.token, itemId: z.string().min(1).max(64) }),
  actorId: SHORTLIST_PAGE_ACTOR_ID,
  audit: { skip: 'appended by the handler in the command transaction: the event needs ids the result does not carry' },
  handler: async ({ deps, input, actor }): Promise<ShortlistCvFile> => {
    const shortlist = await resolve(deps, input.token);
    const { cv, item } = await requireItem(deps, shortlist, input.itemId);
    if (!cv) throw new NotFoundError('The CV is not available.');
    let bytes: Uint8Array;
    try {
      bytes = await deps.files.get(cv.key);
    } catch {
      throw new NotFoundError('The CV is not available.');
    }
    await deps.auditLog.append({
      organizationId: shortlist.organizationId,
      actor,
      action: 'shortlist.cv_opened',
      target: { type: 'client_shortlist', id: shortlist.id },
      metadata: { applicationId: item.applicationId },
    });
    return { bytes, fileName: cv.fileName, mediaType: cv.mediaType, inlineable: cv.mediaType === 'application/pdf' };
  },
});
