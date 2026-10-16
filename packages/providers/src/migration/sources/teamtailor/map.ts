import { IMPORT_NOTE_MAX, migrationPackageItemSchemas, ORIGIN_MAX, TAG_MAX, TAGS_PER_CANDIDATE_MAX, type MigrationJob } from '@candydati/domain';
import type { BuilderApplication, BuilderCandidate, BuilderJob, BuilderNote, BuilderUser } from '../../package-builder.js';
import { linkedId, type TeamtailorResource } from './schemas.js';

/** Pure mapping from Teamtailor records to package items. Nothing here reads a rating, score, picture or demographic field. */

const COVER_LETTER_MAX = 20_000;
const QUESTION_MAX = 500;
const candidateShape = migrationPackageItemSchemas.candidate.shape;

const clean = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};
const cut = (value: string, max: number): string => Array.from(value).slice(0, max).join('').trim();
const asDate = (value: string | null | undefined): string | undefined => {
  const text = clean(value);
  return text !== undefined && !Number.isNaN(Date.parse(text)) ? text : undefined;
};
const later = (a: string, b: string): string => (Date.parse(a) < Date.parse(b) ? b : a);

export const mapUser = (user: TeamtailorResource<'users'>): BuilderUser | undefined => {
  const name = clean(user.attributes.name);
  if (name === undefined) return undefined;
  const email = clean(user.attributes.email);
  const valid = email !== undefined && migrationPackageItemSchemas.user.shape.email.safeParse(email).success;
  return { ref: user.id, name: cut(name, 120), ...(valid ? { email } : {}) };
};

/** https://teamtailor-docs.netlify.app/ (Jobs, `status`: open, draft, archived, unlisted, temp). */
const JOB_STATUS: Readonly<Record<string, MigrationJob['status']>> = { open: 'open', unlisted: 'open', archived: 'closed', draft: 'draft', temp: 'draft' };

export function mapJob(job: TeamtailorResource<'jobs'>, stages: readonly TeamtailorResource<'stages'>[], fallbackDate: string): BuilderJob | undefined {
  const title = clean(job.attributes.title);
  if (title === undefined) return undefined;
  const ordered = [...stages].sort((a, b) => (a.attributes['row-order'] ?? 0) - (b.attributes['row-order'] ?? 0));
  return {
    ref: job.id,
    title: cut(title, 200),
    status: JOB_STATUS[job.attributes.status ?? ''] ?? 'closed',
    createdAt: asDate(job.attributes['created-at']) ?? fallbackDate,
    stages: ordered.map((stage) => ({ ref: stage.id, name: cut(clean(stage.attributes.name) ?? `Stage ${stage.id}`, 120) })),
  };
}

const NAME_UNSAFE = /[@<>]|:\/\/|www\./i;
const safeName = (value: string | undefined): string | undefined => (value === undefined || NAME_UNSAFE.test(value) ? undefined : cut(value, 120) || undefined);
const valid = <T>(schema: { safeParse(value: unknown): { success: boolean } }, value: T | undefined): T | undefined => (value !== undefined && schema.safeParse(value).success ? value : undefined);

function tagsOf(tags: readonly string[] | null | undefined): string[] {
  const unique = new Set((tags ?? []).map((tag) => cut(tag.trim(), TAG_MAX)).filter((tag) => tag !== ''));
  return [...unique].slice(0, TAGS_PER_CANDIDATE_MAX);
}

/** No consent: the API only has the write-only `set-consent-expiration`, so the product asks the person to reconfirm. */
export function mapCandidate(candidate: TeamtailorResource<'candidates'>, fallbackDate: string): BuilderCandidate {
  const a = candidate.attributes;
  const email = valid(candidateShape.email, clean(a.email));
  const local = email?.split('@')[0];
  const firstName = safeName(clean(a['first-name'])) ?? safeName(local) ?? '-';
  const lastName = safeName(clean(a['last-name'])) ?? '-';
  const phone = valid(candidateShape.phone, clean(a.phone));
  const linkedinUrl = valid(candidateShape.linkedinUrl, clean(a['linkedin-url']));
  return {
    ref: candidate.id,
    firstName,
    lastName,
    ...(email === undefined ? {} : { email }),
    ...(phone === undefined ? {} : { phone }),
    ...(linkedinUrl === undefined ? {} : { linkedinUrl }),
    tags: tagsOf(a.tags),
    createdAt: asDate(a['created-at']) ?? fallbackDate,
  };
}

export interface ApplicationContext {
  readonly jobId: string;
  readonly stageId: string;
  readonly candidateId: string;
  /** `stage-type` of the current stage: Inbox, In process or Hired. */
  readonly stageType: string | undefined;
  /** `rejected-by-company` of the reject reason, when the application has one. */
  readonly rejectedByCompany: boolean | undefined;
}

function outcomeOf(application: TeamtailorResource<'applications'>, context: ApplicationContext, createdAt: string): Pick<BuilderApplication, 'outcome' | 'closedAt'> {
  const rejectedAt = asDate(application.attributes['rejected-at']);
  if (rejectedAt !== undefined) return { outcome: context.rejectedByCompany === false ? 'withdrawn' : 'not_selected', closedAt: later(rejectedAt, createdAt) };
  if (context.stageType?.toLowerCase() === 'hired') return { outcome: 'hired', closedAt: later(asDate(application.attributes['changed-stage-at']) ?? createdAt, createdAt) };
  return {};
}

const originOf = (a: TeamtailorResource<'applications'>['attributes']): string | undefined => {
  const site = clean(a['referring-site']);
  if (site !== undefined) return cut(site, ORIGIN_MAX);
  return a.sourced === true ? 'sourced' : undefined;
};

/** Teamtailor keeps only the current stage and when it was entered: one history entry. */
export function mapApplication(application: TeamtailorResource<'applications'>, context: ApplicationContext, fallbackDate: string): BuilderApplication {
  const a = application.attributes;
  const createdAt = asDate(a['created-at']) ?? fallbackDate;
  const origin = originOf(a);
  const letter = clean(a['cover-letter']);
  return {
    ref: application.id,
    candidateRef: context.candidateId,
    jobRef: context.jobId,
    stageRef: context.stageId,
    createdAt,
    ...outcomeOf(application, context, createdAt),
    ...(origin === undefined ? {} : { origin }),
    ...(letter === undefined ? {} : { coverLetter: cut(letter, COVER_LETTER_MAX) }),
    stageHistory: [{ stageRef: context.stageId, enteredAt: later(asDate(a['changed-stage-at']) ?? createdAt, createdAt) }],
  };
}

export function mapNote(note: TeamtailorResource<'notes'>, knownUsers: ReadonlySet<string>): BuilderNote | undefined {
  const a = note.attributes;
  const body = clean(a.note);
  const candidateId = a['candidate-id'];
  const createdAt = asDate(a['created-at']);
  if (body === undefined || candidateId === undefined || candidateId === null || createdAt === undefined) return undefined;
  const authorId = a['user-id'];
  return {
    candidateRef: candidateId,
    ...(authorId !== undefined && authorId !== null && knownUsers.has(authorId) ? { authorRef: authorId } : {}),
    body: cut(body, IMPORT_NOTE_MAX),
    createdAt,
    ...(a['private-note'] === true ? { private: true } : {}),
  };
}

/** An answer to an application form question as text. Choice answers carry only alternative ids: not mapped. */
export function mapAnswer(answer: TeamtailorResource<'answers'>, questionTitle: string | undefined): { readonly question: string; readonly answer: string } | undefined {
  const a = answer.attributes;
  const title = clean(questionTitle);
  const text = clean(a.text) ?? (a.boolean === true || a.boolean === false ? (a.boolean ? 'yes' : 'no') : undefined) ?? (typeof a.range === 'number' ? String(a.range) : undefined);
  if (title === undefined || text === undefined) return undefined;
  return { question: cut(title, QUESTION_MAX), answer: cut(text, IMPORT_NOTE_MAX) };
}

export const candidateIdOfAnswer = (answer: TeamtailorResource<'answers'>): string | undefined => linkedId(answer, 'candidate');
export const questionIdOfAnswer = (answer: TeamtailorResource<'answers'>): string | undefined => linkedId(answer, 'question');

/** The last path segment of a signed URL, without the query: the file name when the API gives none. */
export function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return last === '' ? fallback : last;
  } catch {
    return fallback;
  }
}
