import {
  buildInterviewInvitation,
  DAY_MS,
  INTERVIEW_EMAIL_SLOTS,
  INTERVIEW_HORIZON_DAYS,
  proposeInterviewInputSchema,
  suggestedSlots,
  type Interview,
  type InterviewParticipant,
  type Message,
} from '@candydati/domain';
import { z } from 'zod';
import { toAuditActor, type Actor } from '../../actor.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import type { InterviewDeps } from '../../interview-ports.js';
import { inTransaction } from '../../transaction.js';
import { resolveTargets, type RequestContext } from '../feedback/shared.js';
import { enqueueDelivery } from '../messaging/send-message.js';
import { ensureConversation } from '../messaging/shared.js';
import { availabilityOf, PAGE_CALENDAR_MAX_AGE_MS, slotsFor } from './availability.js';
import { videoRoomOf } from './video-room-of.js';
import { defineInterviewUseCase, loadInterviewContext, toInterviewView, zoneOf, type InterviewView } from './shared.js';

const input = proposeInterviewInputSchema.extend({ applicationId: z.string().min(1) });

export interface ProposeInterviewResult {
  readonly interview: InterviewView;
  /** Free times in the horizon when it was proposed: zero means the candidate will find none and should be told otherwise. */
  readonly freeSlots: number;
  /** Members counted free in default working hours because their calendar is not connected. */
  readonly withoutCalendar: readonly string[];
  /** Whose video room became the link, when the recruiter wrote none. */
  readonly videoRoomOf: string | null;
  /** A video interview that has no link at all: the candidate will not know where to join. */
  readonly withoutLink: boolean;
}

const userOf = (actor: Actor): string => actor.onBehalfOfUserId ?? actor.id ?? 'system';

export async function participantsOf(deps: InterviewDeps, context: RequestContext, chosen: z.output<typeof input>['interviewers']): Promise<readonly InterviewParticipant[]> {
  const organizationId = context.application.organizationId;
  const wanted = chosen
    ? chosen.map((person) => ({ kind: person.kind, userId: person.userId ?? null, email: person.email ?? null, name: person.name ?? '' }))
    : await deps.stageInterviewers.listByStage(organizationId, context.job.id, context.stage.stageId);
  const targets = await resolveTargets(deps, organizationId, wanted);
  if (targets.length === 0) throw new ValidationError([{ path: chosen ? 'interviewers' : 'stageId', message: 'no_interviewers' }]);
  return targets.map((target) => ({ kind: target.kind, userId: target.userId, email: target.kind === 'external' ? target.email : null, name: target.name }));
}

export async function requireContext(deps: InterviewDeps, organizationId: string, applicationId: string, stageId: string): Promise<RequestContext & { readonly durationMinutes: number }> {
  const context = await loadInterviewContext(deps, organizationId, applicationId, stageId);
  if (!context) throw new NotFoundError('Application not found.');
  if (context.stage.declared === null) throw new ValidationError([{ path: 'stageId', message: 'unknown_stage' }]);
  if (context.application.outcome !== null) throw new ValidationError([{ path: 'applicationId', message: 'application_closed' }]);
  return { ...context, durationMinutes: context.stage.declared.durationMinutes };
}

function invitationMessage(deps: InterviewDeps, context: RequestContext, interview: Interview, slots: readonly Date[], sentBy: string): Message {
  const mail = buildInterviewInvitation({
    locale: context.job.content.language,
    interviewId: interview.id,
    firstName: context.candidate.firstName,
    organizationName: context.organization.name,
    jobTitle: context.job.content.title,
    stageLabel: context.stage.label,
    durationMinutes: interview.durationMinutes,
    mode: interview.mode,
    slots: suggestedSlots(slots, INTERVIEW_EMAIL_SLOTS, zoneOf(deps.config)),
    timeZone: zoneOf(deps.config),
  });
  return {
    id: deps.newId(),
    organizationId: interview.organizationId,
    applicationId: interview.applicationId,
    candidateId: context.candidate.id,
    direction: 'outbound',
    subject: mail.subject,
    bodyText: mail.text,
    status: 'queued',
    providerMessageId: null,
    sentBy,
    createdAt: deps.now(),
    sentAt: null,
    error: null,
    rawText: null,
    unverifiedSender: false,
    inboundMessageId: null,
    historical: false,
  };
}

/**
 * Sends the candidate a link to book an interview at a stage, with the interviewers of the stage (or the ones chosen).
 * Free times come from the interviewers' calendars and their other bookings; a few go in the email. The invitation is a
 * message of the conversation (the candidate can reply), its link created at delivery. Never the assistant.
 */
export const proposeInterview = defineInterviewUseCase({
  name: 'proposeInterview',
  input,
  permission: 'interview:schedule',
  audit: { skip: 'appended inside the transaction that stores the interview and its invitation' },
  transaction: { skip: 'calendars are read over the network first; the writes and the audit event share one transaction' },
  handler: async ({ deps, actor, input }): Promise<ProposeInterviewResult> => {
    if (actor.type === 'agent') throw new ForbiddenError('The assistant never writes to candidates.');
    const context = await requireContext(deps, actor.organizationId, input.applicationId, input.stageId);
    const interviewers = await participantsOf(deps, context, input.interviewers);
    const availability = await availabilityOf(deps, actor.organizationId, interviewers, { maxAgeMs: PAGE_CALENDAR_MAX_AGE_MS });
    const slots = slotsFor(deps, context, availability);
    const written = input.location || null;
    const room = input.mode === 'video' && written === null ? await videoRoomOf(deps, actor.organizationId, interviewers) : null;
    const location = written ?? room?.url ?? null;
    const now = deps.now();
    const interview: Interview = {
      id: deps.newId(), organizationId: actor.organizationId, applicationId: context.application.id, jobId: context.job.id, stageId: context.stage.stageId,
      status: 'proposed', durationMinutes: context.durationMinutes, mode: input.mode, location, startsAt: null, endsAt: null,
      // A placeholder nobody holds: the real secret is made when the invitation is sent.
      tokenHash: deps.hash(deps.newToken()), tokenExpiresAt: new Date(now.getTime() + INTERVIEW_HORIZON_DAYS * DAY_MS),
      icsSequence: 0, proposedBy: userOf(actor), bookedAt: null, cancelledAt: null, cancelledBy: null, reminderSentAt: null, createdAt: now, updatedAt: now, interviewers,
    };
    const stored = await inTransaction(deps, async (tx) => {
      const created = await tx.interviews.create(interview);
      await ensureConversation(tx, created.organizationId, created.applicationId);
      await enqueueDelivery(tx, await tx.messages.create(invitationMessage(tx, context, created, slots, userOf(actor))));
      await tx.auditLog.append({
        organizationId: created.organizationId, actor: toAuditActor(actor), action: 'interview.proposed', target: { type: 'interview', id: created.id },
        metadata: { applicationId: created.applicationId, stageId: created.stageId, interviewers: interviewers.length, freeSlots: slots.length },
      });
      return created;
    });
    const withoutCalendar = interviewers.filter((person) => person.userId !== null && availability.withoutCalendar.includes(person.userId)).map((person) => person.name);
    return { interview: toInterviewView(stored), freeSlots: slots.length, withoutCalendar, videoRoomOf: room?.owner ?? null, withoutLink: input.mode === 'video' && location === null };
  },
});
