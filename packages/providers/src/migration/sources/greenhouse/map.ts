import { IMPORT_NOTE_MAX, JOB_TITLE_MAX, ORIGIN_MAX, STAGE_TITLE_MAX, TAG_MAX, TAGS_PER_CANDIDATE_MAX, MIGRATION_LIMITS } from '@candydati/domain';
import { z } from 'zod';
import type { BuilderApplication, BuilderCandidate, BuilderFile, BuilderJob, BuilderMessage, BuilderNote, BuilderUser } from '../../package-builder.js';
import type { GhApplication, GhApplicationStage, GhAttachment, GhCandidate, GhJob, GhNote, GhStage, GhUser } from './schemas.js';

/**
 * Pure mapping of Harvest v3 records to package items. What the package has no field for is simply never read:
 * scorecards and ratings (never requested), EEOC and demographic data (never called), offers' salaries (offer
 * attachments are dropped), AI opt-out statuses.
 */
const EMAIL = z.email().max(254);
const PHONE = /^\+?[0-9 ()-]{6,20}$/;
const MESSAGE_MAX = 50_000;
const address = /[^\s<>,;"']+@[^\s<>,;"']+/g;

const cut = (value: string, max: number): string => Array.from(value.trim()).slice(0, max).join('');
const iso = (value: string): string => new Date(value).toISOString();
/** A date that is never before `floor` (the package refuses a closing before the creation). */
const notBefore = (value: string, floor: string): string => (Date.parse(value) < Date.parse(floor) ? floor : value);
const first = <T>(items: readonly T[] | null | undefined, pick: (item: T) => boolean): T | undefined => items?.find(pick);

export const addressesIn = (value: string | null | undefined): readonly string[] => (value ?? '').toLowerCase().match(address) ?? [];

export function mapUser(user: GhUser): BuilderUser | null {
  const email = user.primary_email?.trim();
  const name = user.name?.trim() || [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || email;
  if (!name) return null;
  return { ref: String(user.id), name: cut(name, 120), ...(email && EMAIL.safeParse(email).success ? { email } : {}) };
}

/** Stages in plan order; inactive ones stay because history still points at them. At most the package's limit. */
export function mapStages(stages: readonly GhStage[]): BuilderJob['stages'] {
  return [...stages]
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .slice(0, MIGRATION_LIMITS.stagesPerJob)
    .map((stage) => ({ ref: String(stage.id), name: cut(stage.name, STAGE_TITLE_MAX) || 'Stage' }));
}

/** Templates are hiring plans, not jobs: null. */
export function mapJob(job: GhJob, stages: readonly GhStage[]): BuilderJob | null {
  if (job.is_template === true) return null;
  const createdAt = iso(job.created_at);
  const closedAt = job.status === 'closed' && job.closed_at ? notBefore(iso(job.closed_at), createdAt) : undefined;
  return { ref: String(job.id), title: cut(job.name, JOB_TITLE_MAX) || 'Job', status: job.status, createdAt, ...(closedAt ? { closedAt } : {}), stages: mapStages(stages) };
}

const withScheme = (value: string): string => (/^https?:\/\//i.test(value) ? value : `https://${value}`);

/** No consent: Harvest documents no consent date, so the product asks the person to reconfirm. */
export function mapCandidate(candidate: GhCandidate): BuilderCandidate | null {
  const firstName = candidate.first_name?.trim();
  const lastName = candidate.last_name?.trim();
  if (!firstName && !lastName) return null;
  const email = first(candidate.email_addresses, (e) => EMAIL.safeParse(e.value.trim()).success)?.value.trim();
  const phone = first(candidate.phone_numbers, (p) => PHONE.test(p.value.trim()))?.value.trim();
  const linkedin = first(candidate.social_media_addresses, (s) => /linkedin\.com\//i.test(s.value))?.value.trim();
  const tags = [...new Set((candidate.tags ?? []).map((tag) => cut(tag, TAG_MAX)).filter(Boolean))].slice(0, TAGS_PER_CANDIDATE_MAX);
  return {
    ref: String(candidate.id),
    firstName: firstName || lastName || '',
    lastName: lastName || firstName || '',
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(linkedin ? { linkedinUrl: withScheme(linkedin) } : {}),
    tags,
    createdAt: iso(candidate.created_at),
  };
}

/** What an application needs from the rest of the package. */
export interface ApplicationContext {
  /** Stage refs of the application's job, in plan order. */
  readonly jobStages: readonly string[];
  readonly history: readonly GhApplicationStage[];
  readonly sourceName: string | undefined;
}

export function mapApplication(application: GhApplication, context: ApplicationContext): BuilderApplication | null {
  const known = new Set(context.jobStages);
  const stage = application.job_interview_stage_id === null || application.job_interview_stage_id === undefined ? undefined : String(application.job_interview_stage_id);
  const stageRef = stage !== undefined && known.has(stage) ? stage : context.jobStages[0];
  if (stageRef === undefined) return null;
  const createdAt = iso(application.created_at);
  const stageHistory = context.history
    .filter((entry) => entry.entered_at && known.has(String(entry.job_interview_stage_id)))
    .map((entry) => ({ stageRef: String(entry.job_interview_stage_id), enteredAt: iso(entry.entered_at ?? '') }))
    .sort((a, b) => Date.parse(a.enteredAt) - Date.parse(b.enteredAt))
    .slice(-MIGRATION_LIMITS.stageHistoryPerApplication);
  const closing = outcomeOf(application, createdAt);
  const answers = (application.answers ?? [])
    .map((a) => ({ question: cut(a.question ?? '', 500), answer: cut(a.answer ?? '', IMPORT_NOTE_MAX) }))
    .filter((a) => a.question !== '' && a.answer !== '')
    .slice(0, MIGRATION_LIMITS.answersPerApplication);
  const origin = context.sourceName ? cut(context.sourceName, ORIGIN_MAX) : '';
  return {
    ref: String(application.id),
    candidateRef: String(application.candidate_id),
    jobRef: String(application.job_id),
    stageRef,
    createdAt,
    ...closing,
    ...(origin ? { origin } : {}),
    answers,
    stageHistory,
  };
}

/**
 * Rejected: not selected, closed when it was rejected. Hired: the docs give no hiring date, so the last update of the
 * application stands in for it (assumption, stated in the README). Converted and in process: still open.
 */
function outcomeOf(application: GhApplication, createdAt: string): Pick<BuilderApplication, 'outcome' | 'closedAt'> {
  if (application.status === 'rejected') return { outcome: 'not_selected', closedAt: notBefore(iso(application.rejected_at ?? application.updated_at), createdAt) };
  if (application.status === 'hired') return { outcome: 'hired', closedAt: notBefore(iso(application.updated_at), createdAt) };
  return {};
}

/** Notes keep their author and visibility; anything not explicitly public stays private. */
export function mapNote(note: GhNote, users: ReadonlySet<string>, applicationOk: boolean): BuilderNote | null {
  const body = cut(note.body ?? '', IMPORT_NOTE_MAX);
  if (note.candidate_id === null || note.candidate_id === undefined || body === '') return null;
  const author = note.user_id === null || note.user_id === undefined ? undefined : String(note.user_id);
  return {
    candidateRef: String(note.candidate_id),
    ...(applicationOk && note.application_id !== null && note.application_id !== undefined ? { applicationRef: String(note.application_id) } : {}),
    ...(author !== undefined && users.has(author) ? { authorRef: author } : {}),
    body,
    createdAt: iso(note.created_at),
    private: note.visibility !== 'publicly_visible',
  };
}

/** A past email: inbound when it was sent from one of the candidate's addresses, outbound otherwise. */
export function mapEmail(note: GhNote, candidateEmails: ReadonlySet<string>): BuilderMessage | null {
  const body = cut(note.body ?? '', MESSAGE_MAX);
  if (note.application_id === null || note.application_id === undefined || body === '') return null;
  const from = addressesIn(note.email_from);
  const to = addressesIn(note.email_to);
  const subject = note.subject ? cut(note.subject, 1000) : '';
  return {
    applicationRef: String(note.application_id),
    direction: from.some((a) => candidateEmails.has(a)) ? 'inbound' : 'outbound',
    at: iso(note.created_at),
    ...(from[0] ? { from: cut(from[0], 320) } : {}),
    ...(to[0] ? { to: cut(to[0], 320) } : {}),
    ...(subject ? { subject } : {}),
    body,
  };
}

/** Offer documents carry salary and agreements are contracts: neither comes across. */
const FILE_KINDS: Readonly<Record<string, BuilderFile['kind']>> = {
  resume: 'cv',
  cover_letter: 'cover_letter',
  other: 'other',
  take_home_test: 'other',
  form_attachment: 'other',
};

export const fileKindOf = (attachment: GhAttachment): BuilderFile['kind'] | null => FILE_KINDS[attachment.type] ?? null;
