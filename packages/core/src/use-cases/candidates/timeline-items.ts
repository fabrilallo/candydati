import { SYSTEM_SENDER, type ActorType, type Application, type CandidateNote, type InterviewFeedback, type Message, type StageEvent, type TimelineActorDto } from '@candydati/domain';
import type { TimelineItemView } from './views.js';

const UNKNOWN_MEMBER = 'Former member';
const EXCERPT_MAX = 160;

const person = (name: string | undefined): TimelineActorDto => ({ type: 'person', name: name ?? UNKNOWN_MEMBER });

const eventActor = (type: ActorType): TimelineActorDto => ({ type: type === 'user' ? 'person' : type, name: null });

/** The intake event (no previous stage, no outcome) is the "received" entry: it only says in which stage the application began. */
export const isIntake = (event: StageEvent): boolean => event.fromStageId === null && event.outcome === null && event.toStageId !== null;

export function receivedItem(application: Application, intake: StageEvent | undefined): TimelineItemView {
  return {
    kind: 'received',
    id: `received:${application.id}`,
    at: application.createdAt,
    actor: application.source === 'manual' ? null : { type: 'candidate', name: null },
    fromPreviousSystem: (application.migrationBatchId ?? null) !== null,
    source: application.source,
    origin: application.origin,
    campaign: application.originCampaign ?? null,
    stageId: intake?.toStageId ?? null,
  };
}

export function stageItems(events: readonly StageEvent[], application: Application): readonly TimelineItemView[] {
  const items = events.filter((event) => !isIntake(event)).map((event): TimelineItemView => {
    const base = { id: `stage:${event.id}`, at: event.occurredAt, actor: eventActor(event.actorType), fromPreviousSystem: event.backfilled };
    return event.outcome !== null
      ? { ...base, kind: 'decided', outcome: event.outcome }
      : { ...base, kind: 'stage_moved', fromStageId: event.fromStageId, toStageId: event.toStageId ?? application.stageId };
  });
  const decided = items.some((item) => item.kind === 'decided');
  if (application.outcome === null || decided) return items;
  const at = application.closedAt ?? application.updatedAt;
  return [...items, { kind: 'decided', id: `outcome:${application.id}`, at, actor: null, fromPreviousSystem: false, outcome: application.outcome }];
}

export function noteItems(notes: readonly CandidateNote[], applicationId: string, names: Readonly<Record<string, string>>): readonly TimelineItemView[] {
  return notes
    .filter((note) => note.applicationId === applicationId)
    .map((note): TimelineItemView => ({
      kind: 'note',
      id: `note:${note.id}`,
      at: note.createdAt,
      actor: note.authorId === null ? { type: 'external', name: note.authorName ?? UNKNOWN_MEMBER } : person(names[note.authorId]),
      fromPreviousSystem: note.authorId === null,
      excerpt: note.body.length > EXCERPT_MAX ? `${note.body.slice(0, EXCERPT_MAX - 1)}…` : note.body,
    }));
}

const senderOf = (message: Message, names: Readonly<Record<string, string>>): TimelineActorDto | null => {
  if (message.direction === 'inbound') return { type: 'candidate', name: null };
  if (message.sentBy === null) return null;
  return message.sentBy === SYSTEM_SENDER ? { type: 'system', name: null } : person(names[message.sentBy]);
};

export const messageItems = (messages: readonly Message[], names: Readonly<Record<string, string>>): readonly TimelineItemView[] =>
  messages.map((message): TimelineItemView => ({
    kind: 'message',
    id: `message:${message.id}`,
    at: message.sentAt ?? message.createdAt,
    actor: senderOf(message, names),
    fromPreviousSystem: message.historical,
    direction: message.direction,
    status: message.status,
    subject: message.subject,
  }));

/** Only the fact that feedback came in, from whom and for which stage: never the answers or the recommendation. */
export const feedbackItems = (feedback: readonly InterviewFeedback[]): readonly TimelineItemView[] =>
  feedback.map((item): TimelineItemView => ({
    kind: 'feedback_submitted',
    id: `feedback:${item.id}`,
    at: item.submittedAt,
    actor: { type: 'external', name: item.interviewerName },
    fromPreviousSystem: false,
    stageId: item.stageId,
  }));

/** Reconfirmation is asked of imported people only: the request goes out once, the answer is the consent they then give. */
export function consentItems(application: Application): readonly TimelineItemView[] {
  const sentAt = application.reconfirmationSentAt ?? null;
  if (sentAt === null) return [];
  const sent: TimelineItemView = { kind: 'reconfirmation_sent', id: `reconfirmation:${application.id}`, at: sentAt, actor: { type: 'system', name: null }, fromPreviousSystem: false };
  const givenAt = application.consent.givenAt;
  if (application.consentStatus !== 'given' || !givenAt) return [sent];
  return [sent, { kind: 'reconfirmation_answered', id: `reconfirmed:${application.id}`, at: givenAt, actor: { type: 'candidate', name: null }, fromPreviousSystem: false }];
}

const RANK: Readonly<Record<TimelineItemView['kind'], number>> = {
  received: 0, reconfirmation_sent: 1, reconfirmation_answered: 2, stage_moved: 3, note: 4, message: 5, feedback_submitted: 6, decided: 7,
};

/** Oldest first; same instant: received first, the outcome last, then by id so the order never flickers. */
export const chronological = (items: readonly TimelineItemView[]): readonly TimelineItemView[] =>
  items.toSorted((a, b) => a.at.getTime() - b.at.getTime() || RANK[a.kind] - RANK[b.kind] || a.id.localeCompare(b.id));
