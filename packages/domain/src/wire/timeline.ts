import { z } from 'zod';
import { OUTCOMES } from '../candidate/application.js';
import { MESSAGE_DIRECTIONS, MESSAGE_STATUSES } from '../messaging/message.js';
import { isoDate } from './common.js';

/** Where an entry of the timeline comes from. `external` is a name that is not a member (an interviewer by link, a migrated note author). */
export const TIMELINE_ACTOR_TYPES = ['person', 'agent', 'api_key', 'system', 'candidate', 'external'] as const;
export type TimelineActorType = (typeof TIMELINE_ACTOR_TYPES)[number];

export const timelineActorSchema = z.object({ type: z.enum(TIMELINE_ACTOR_TYPES), name: z.string().nullable() });
export type TimelineActorDto = z.infer<typeof timelineActorSchema>;

const base = {
  id: z.string(),
  at: isoDate,
  /** Null when nobody is known (a stage move recorded by a person: the history keeps only the kind of actor). */
  actor: timelineActorSchema.nullable(),
  /** The entry was rebuilt or brought by a migration from the previous system. */
  fromPreviousSystem: z.boolean(),
};

/**
 * One entry of the timeline of an application. There is no score, rank or recommendation in any of them: feedback shows
 * that it was submitted, never what it says.
 */
export const timelineItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('received'), source: z.enum(['careers_page', 'manual', 'import']), origin: z.string(), campaign: z.string().nullable(), stageId: z.string().nullable() }),
  z.object({ ...base, kind: z.literal('stage_moved'), fromStageId: z.string().nullable(), toStageId: z.string() }),
  z.object({ ...base, kind: z.literal('decided'), outcome: z.enum(OUTCOMES) }),
  z.object({ ...base, kind: z.literal('note'), excerpt: z.string() }),
  z.object({ ...base, kind: z.literal('message'), direction: z.enum(MESSAGE_DIRECTIONS), status: z.enum(MESSAGE_STATUSES), subject: z.string() }),
  z.object({ ...base, kind: z.literal('feedback_submitted'), stageId: z.string() }),
  z.object({ ...base, kind: z.literal('reconfirmation_sent') }),
  z.object({ ...base, kind: z.literal('reconfirmation_answered') }),
]);
export type TimelineItemDto = z.infer<typeof timelineItemSchema>;
export type TimelineItemKind = TimelineItemDto['kind'];

/** `GET /applications/:id/timeline`: oldest first. */
export const applicationTimelineSchema = z.object({ items: z.array(timelineItemSchema) });
export type ApplicationTimelineDto = z.infer<typeof applicationTimelineSchema>;
