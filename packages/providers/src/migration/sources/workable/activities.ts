import { IMPORT_NOTE_MAX } from '@candydati/domain';
import { htmlToText } from '../../../email/html-text.js';
import type { BuilderMessage, BuilderNote } from '../../package-builder.js';
import type { WorkableActivity } from './client.js';
import type { StageLookup } from './stages.js';

const MESSAGE_MAX = 50_000;
const NAME_MAX = 120;
const MAX_STAGE_ENTRIES = 200;
/** Actions that are not a move into a stage. `rating` is dropped on purpose (ADR 0009, decision 3). */
const NOT_A_MOVE: ReadonlySet<string> = new Set(['comment', 'message', 'rating', 'event', 'disqualification', 'revert', 'disqualify']);

export interface MemberRef {
  readonly name: string | null;
  readonly email: string | null;
}

export interface ActivityContext {
  readonly candidateRef: string;
  readonly applicationRef: string;
  readonly candidateEmail: string | null;
  readonly lookup: StageLookup;
  /** Members by Workable id; a member that is also a package user signs notes by reference. */
  readonly members: ReadonlyMap<string, MemberRef>;
  readonly disqualificationReason: string | null;
}

export interface MappedActivities {
  readonly stageHistory: readonly { readonly stageRef: string; readonly enteredAt: string }[];
  readonly notes: readonly BuilderNote[];
  readonly messages: readonly BuilderMessage[];
  /** When the stream says the candidate was disqualified, or entered the hired stage. */
  readonly disqualifiedAt: string | null;
  readonly hiredAt: string | null;
}

export const toIso = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined || value.trim() === '') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

const textOf = (html: string | null | undefined, max: number): string => Array.from(htmlToText(html ?? '')).slice(0, max).join('');

function stageOf(activity: WorkableActivity, lookup: StageLookup): string | null {
  if (NOT_A_MOVE.has(activity.action)) return null;
  return lookup.resolve(activity.target_stage?.name, activity.stage_name, activity.action);
}

function author(activity: WorkableActivity, context: ActivityContext): Pick<BuilderNote, 'authorRef' | 'authorName'> {
  const id = activity.member?.id;
  if (id !== null && id !== undefined && context.members.has(id)) return { authorRef: id };
  const name = activity.member?.name?.trim();
  return name === undefined || name === '' ? {} : { authorName: Array.from(name).slice(0, NAME_MAX).join('') };
}

function noteOf(activity: WorkableActivity, context: ActivityContext, at: string, body: string): BuilderNote {
  return { candidateRef: context.candidateRef, applicationRef: context.applicationRef, ...author(activity, context), body, createdAt: at };
}

/** `member` present: the team wrote it. Absent: it came from the candidate. An assumption the README states. */
function messageOf(activity: WorkableActivity, context: ActivityContext, at: string, body: string): BuilderMessage {
  const memberEmail = activity.member?.id === null || activity.member?.id === undefined ? null : (context.members.get(activity.member.id)?.email ?? null);
  const outbound = activity.member !== null && activity.member !== undefined;
  const from = outbound ? memberEmail : context.candidateEmail;
  const to = outbound ? context.candidateEmail : null;
  return { applicationRef: context.applicationRef, direction: outbound ? 'outbound' : 'inbound', at, ...(from === null ? {} : { from }), ...(to === null ? {} : { to }), body };
}

/**
 * The candidate's activity stream into package history: moves into stage entries with dates, comments into notes,
 * messages into historical emails, the disqualification into its date. Ratings and every other action are dropped.
 */
export function mapActivities(activities: readonly WorkableActivity[], context: ActivityContext): MappedActivities {
  const dated = activities.flatMap((activity) => {
    const at = toIso(activity.created_at);
    return at === null ? [] : [{ activity, at }];
  });
  dated.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let stageHistory: MappedActivities['stageHistory'] = [];
  let notes: readonly BuilderNote[] = [];
  let messages: readonly BuilderMessage[] = [];
  let disqualifiedAt: string | null = null;
  let hiredAt: string | null = null;
  for (const { activity, at } of dated) {
    const stage = stageOf(activity, context.lookup);
    if (stage !== null) {
      stageHistory = [...stageHistory, { stageRef: stage, enteredAt: at }];
      if (context.lookup.kindOf(stage) === 'hired' && hiredAt === null) hiredAt = at;
    } else if (activity.action === 'comment') {
      const body = textOf(activity.body, IMPORT_NOTE_MAX);
      if (body !== '') notes = [...notes, noteOf(activity, context, at, body)];
    } else if (activity.action === 'message') {
      const body = textOf(activity.body, MESSAGE_MAX);
      if (body !== '') messages = [...messages, messageOf(activity, context, at, body)];
    } else if (activity.action === 'disqualification') {
      disqualifiedAt = at;
      const reason = textOf(activity.body, IMPORT_NOTE_MAX - 20) || context.disqualificationReason;
      if (reason !== null && reason !== '') notes = [...notes, noteOf(activity, context, at, `Disqualified: ${reason}`)];
    }
  }
  return { stageHistory: stageHistory.slice(-MAX_STAGE_ENTRIES), notes, messages, disqualifiedAt, hiredAt };
}
