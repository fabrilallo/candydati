import { bookInterviewInputSchema, canCandidateChange, DAY_MS, type Interview, type InterviewMode, type InterviewStatus, type Locale } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../../errors.js';
import type { InterviewDeps } from '../../interview-ports.js';
import { afterCommitOrNow, inTransaction } from '../../transaction.js';
import { definePublicCommand, definePublicQuery } from '../../use-case.js';
import type { RequestContext } from '../feedback/shared.js';
import { availabilityOf, PAGE_CALENDAR_MAX_AGE_MS, slotsFor } from './availability.js';
import { announceInterviewChange } from './alerts.js';
import { sendInterviewNotices } from './notices.js';
import { INTERVIEW_NOT_VALID, INTERVIEW_PAGE_ACTOR_ID, loadInterviewContext, memberIdsOf } from './shared.js';

const tokenInput = z.strictObject({ token: z.string().min(16).max(200) });
const PAGE_ACTOR = { type: 'system' as const, id: INTERVIEW_PAGE_ACTOR_ID, onBehalfOfUserId: null };

interface Resolved {
  readonly interview: Interview;
  readonly context: RequestContext;
}

/** Unknown, expired, closed or no longer visible: all the same "not valid", nothing says whether the link existed. */
async function resolve(deps: InterviewDeps, secret: string): Promise<Resolved> {
  const interview = await deps.interviews.findByTokenHash(deps.hash(secret));
  if (!interview || interview.tokenExpiresAt <= deps.now()) throw new NotFoundError(INTERVIEW_NOT_VALID);
  const context = await loadInterviewContext(deps, interview.organizationId, interview.applicationId, interview.stageId);
  if (!context || context.application.outcome !== null) throw new NotFoundError(INTERVIEW_NOT_VALID);
  return { interview, context };
}

/** What the candidate reads: the interview and the free times, never who else is busy or why. */
export interface PublicInterviewView {
  readonly organizationName: string;
  readonly language: Locale;
  readonly firstName: string;
  readonly jobTitle: string;
  readonly stageLabel: string;
  readonly durationMinutes: number;
  readonly mode: InterviewMode;
  readonly location: string | null;
  /** First names only. */
  readonly interviewers: readonly string[];
  readonly status: InterviewStatus;
  readonly startsAt: Date | null;
  readonly canChange: boolean;
  /** Free start times, for booking or moving; empty when cancelled or too late to change. */
  readonly slots: readonly Date[];
}

const mayChoose = (interview: Interview, now: Date): boolean =>
  interview.status === 'proposed' || (interview.status === 'booked' && interview.startsAt !== null && canCandidateChange(interview.startsAt, now));

export const getInterviewInvitation = definePublicQuery<InterviewDeps, typeof tokenInput, PublicInterviewView>({
  name: 'getInterviewInvitation',
  input: tokenInput,
  handler: async ({ deps, input }) => {
    const { interview, context } = await resolve(deps, input.token);
    const now = deps.now();
    const choose = mayChoose(interview, now);
    const slots = choose ? slotsFor(deps, interview, await availabilityOf(deps, interview.organizationId, interview.interviewers, { maxAgeMs: PAGE_CALENDAR_MAX_AGE_MS, exceptInterviewId: interview.id })) : [];
    return {
      organizationName: context.organization.name,
      language: context.job.content.language,
      firstName: context.candidate.firstName,
      jobTitle: context.job.content.title,
      stageLabel: context.stage.label,
      durationMinutes: interview.durationMinutes,
      mode: interview.mode,
      location: interview.status === 'booked' ? interview.location : null,
      interviewers: interview.interviewers.map((person) => person.name.trim().split(/\s+/)[0] ?? person.name),
      status: interview.status,
      startsAt: interview.startsAt,
      canChange: choose,
      slots,
    };
  },
});

export interface BookInterviewResult {
  readonly status: 'booked';
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The link changes at every booking (the old one stops working): the page continues on this one. */
  readonly token: string;
}

const bookInput = tokenInput.extend(bookInterviewInputSchema.shape);

/** Checks the time again inside the lock: everyone free, in hours, nobody else booked them meanwhile. */
async function storeBooking(deps: InterviewDeps, interview: Interview, slot: Date, secret: string): Promise<Interview> {
  const moving = interview.status === 'booked';
  return inTransaction(deps, async (tx) => {
    await tx.interviews.lockPeople(interview.organizationId, memberIdsOf(interview));
    const availability = await availabilityOf(tx, interview.organizationId, interview.interviewers, { maxAgeMs: Number.POSITIVE_INFINITY, exceptInterviewId: interview.id });
    if (!slotsFor(tx, interview, availability).some((free) => free.getTime() === slot.getTime())) throw new ConflictError('slot_taken');
    const now = tx.now();
    const endsAt = new Date(slot.getTime() + interview.durationMinutes * 60_000);
    const booked = await tx.interviews.update(interview.organizationId, interview.id, { statuses: [interview.status], icsSequence: interview.icsSequence }, {
      status: 'booked', startsAt: slot, endsAt, bookedAt: interview.bookedAt ?? now, icsSequence: moving ? interview.icsSequence + 1 : interview.icsSequence,
      tokenHash: tx.hash(secret), tokenExpiresAt: new Date(endsAt.getTime() + DAY_MS), updatedAt: now,
    });
    if (!booked) throw new ConflictError('interview_changed');
    await tx.auditLog.append({
      organizationId: booked.organizationId, actor: PAGE_ACTOR, action: moving ? 'interview.rescheduled' : 'interview.booked', target: { type: 'interview', id: booked.id },
      metadata: { applicationId: booked.applicationId, stageId: booked.stageId, startsAt: slot.toISOString() },
    });
    await announceInterviewChange(tx, booked, moving ? 'rescheduled' : 'booked', 'candidate', true);
    return booked;
  });
}

/**
 * Books a free time, or moves a booked interview until 12 hours before. The calendars are read again first, then the
 * time is checked once more under a lock on the interviewers, so two candidates never take the same person. Everyone
 * then gets the invite (moved: the same event, a higher SEQUENCE).
 */
export const bookInterview = definePublicCommand<InterviewDeps, typeof bookInput, BookInterviewResult>({
  name: 'bookInterview',
  input: bookInput,
  actorId: INTERVIEW_PAGE_ACTOR_ID,
  audit: { skip: 'appended inside the booking transaction' },
  transaction: { skip: 'calendars are read over the network first; the booking opens its own transaction' },
  handler: async ({ deps, input }) => {
    const { interview, context } = await resolve(deps, input.token);
    if (interview.status === 'cancelled') throw new ConflictError('interview_cancelled');
    if (!mayChoose(interview, deps.now())) throw new ConflictError('too_late_to_change');
    // Fresh calendars before the lock, so the lock is never held across a network read.
    await availabilityOf(deps, interview.organizationId, interview.interviewers, { maxAgeMs: 0, exceptInterviewId: interview.id });
    const secret = deps.newToken();
    const booked = await storeBooking(deps, interview, new Date(input.slot), secret);
    await afterCommitOrNow(deps, async () => void (await sendInterviewNotices(deps, context, booked, interview.status === 'booked' ? 'rescheduled' : 'booked', secret)));
    return { status: 'booked', startsAt: booked.startsAt ?? new Date(input.slot), endsAt: booked.endsAt ?? new Date(input.slot), token: secret };
  },
});

/** The candidate says no to a proposal, or cancels a booked interview until 12 hours before. */
export const cancelInterviewByCandidate = definePublicCommand<InterviewDeps, typeof tokenInput, { readonly status: 'cancelled' }>({
  name: 'cancelInterviewByCandidate',
  input: tokenInput,
  actorId: INTERVIEW_PAGE_ACTOR_ID,
  audit: { skip: 'appended by the handler in the command transaction' },
  handler: async ({ deps, input, actor }) => {
    const { interview, context } = await resolve(deps, input.token);
    if (interview.status === 'cancelled') return { status: 'cancelled' };
    if (!mayChoose(interview, deps.now())) throw new ConflictError('too_late_to_change');
    const wasBooked = interview.status === 'booked';
    const now = deps.now();
    const cancelled = await deps.interviews.update(interview.organizationId, interview.id, { statuses: [interview.status], icsSequence: interview.icsSequence }, {
      status: 'cancelled', cancelledAt: now, cancelledBy: 'candidate', icsSequence: wasBooked ? interview.icsSequence + 1 : interview.icsSequence, updatedAt: now,
    });
    if (!cancelled) throw new ConflictError('interview_changed');
    await deps.auditLog.append({
      organizationId: cancelled.organizationId, actor, action: 'interview.cancelled', target: { type: 'interview', id: cancelled.id },
      metadata: { applicationId: cancelled.applicationId, stageId: cancelled.stageId, by: 'candidate', wasBooked },
    });
    await announceInterviewChange(deps, cancelled, 'cancelled', 'candidate', true);
    if (wasBooked) await afterCommitOrNow(deps, async () => void (await sendInterviewNotices(deps, context, cancelled, 'cancelled', null)));
    return { status: 'cancelled' };
  },
});
