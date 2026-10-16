import { IMPORT_NOTE_MAX, JOB_TITLE_MAX, ORIGIN_MAX, TAGS_PER_CANDIDATE_MAX, TAG_MAX, httpUrlOrNull, isSafePersonName, type Outcome } from '@candydati/domain';
import { z } from 'zod';
import { htmlToText } from '../../../email/html-text.js';
import type { BuilderApplication, BuilderCandidate, BuilderJob } from '../../package-builder.js';
import { toIso, type MappedActivities } from './activities.js';
import type { WorkableCandidate, WorkableJob } from './client.js';
import type { StageLookup } from './stages.js';

const PHONE = /^\+?[0-9 ()-]{6,20}$/;
const ANSWERS_MAX = 100;
const ANSWER_QUESTION_MAX = 500;

const cut = (value: string, max: number): string => Array.from(value).slice(0, max).join('');

/** Workable: `published` is open; `closed` (internal or confidential) and `archived` are closed. */
export function mapJob(job: WorkableJob, lookup: StageLookup, now: string): BuilderJob {
  const status = job.state === 'draft' ? 'draft' : job.state === 'published' ? 'open' : 'closed';
  return { ref: job.shortcode, title: cut(job.title.trim() || job.shortcode, JOB_TITLE_MAX), status, createdAt: toIso(job.created_at) ?? now, stages: [...lookup.stages] };
}

/** First and last name from the separate fields, else the full name split at its first space. */
function namesOf(candidate: WorkableCandidate): { firstName: string; lastName: string } {
  const full = (candidate.name ?? '').trim();
  const [head = '', ...rest] = full.split(/\s+/);
  const first = (candidate.firstname ?? '').trim() || head;
  const last = (candidate.lastname ?? '').trim() || rest.join(' ');
  const safe = (value: string) => (isSafePersonName(value) ? cut(value, 120) : '');
  return { firstName: safe(first) || '-', lastName: safe(last) || '-' };
}

const linkedinOf = (candidate: WorkableCandidate): string | null => {
  const url = candidate.social_profiles?.find((profile) => profile.type === 'linkedin')?.url;
  const checked = httpUrlOrNull(url);
  return checked !== null && checked.length <= 300 ? checked : null;
};

/** The person. No address, headline, summary, skills, education, experience or photo: the package has no field for them. */
export function mapCandidate(candidate: WorkableCandidate, fallbackAt: string): BuilderCandidate {
  const email = z.email().max(254).safeParse((candidate.email ?? '').trim());
  const phone = (candidate.phone ?? '').trim();
  const linkedinUrl = linkedinOf(candidate);
  const tags = [...new Set((candidate.tags ?? []).map((tag) => cut(tag.trim(), TAG_MAX)).filter((tag) => tag !== ''))].slice(0, TAGS_PER_CANDIDATE_MAX);
  return {
    ref: candidate.id,
    ...namesOf(candidate),
    ...(email.success ? { email: email.data } : {}),
    ...(PHONE.test(phone) ? { phone } : {}),
    ...(linkedinUrl === null ? {} : { linkedinUrl }),
    tags,
    createdAt: toIso(candidate.created_at) ?? fallbackAt,
  };
}

/** `sourced` when the team found the person, else the referrer domain Workable recorded. */
function originOf(candidate: WorkableCandidate): string | undefined {
  if (candidate.sourced === true) return 'sourced';
  const domain = cut((candidate.domain ?? '').trim().toLowerCase(), ORIGIN_MAX);
  return domain === '' ? undefined : domain;
}

function answersOf(candidate: WorkableCandidate): NonNullable<BuilderApplication['answers']> {
  const answers = (candidate.answers ?? []).flatMap((entry) => {
    const question = cut(htmlToText(entry.question?.body ?? ''), ANSWER_QUESTION_MAX);
    const choices = (entry.answer?.choices ?? []).map((choice) => choice.body ?? '').filter((body) => body !== '').join(', ');
    const checked = entry.answer?.checked;
    const raw = entry.answer?.body ?? (choices !== '' ? choices : checked === null || checked === undefined ? '' : checked ? 'yes' : 'no');
    const answer = cut(htmlToText(raw), IMPORT_NOTE_MAX);
    return question === '' || answer === '' ? [] : [{ question, answer }];
  });
  return answers.slice(0, ANSWERS_MAX);
}

interface Closing {
  readonly outcome: Outcome;
  readonly closedAt: string;
}

const later = (value: string | null, createdAt: string): string => (value === null || Date.parse(value) < Date.parse(createdAt) ? createdAt : value);

/** Disqualified: `withdrew` is withdrawn, else not selected. Otherwise hired when Workable says so. */
function closingOf(candidate: WorkableCandidate, stageRef: string, activities: MappedActivities, lookup: StageLookup, createdAt: string): Closing | null {
  const updated = toIso(candidate.updated_at);
  if (candidate.disqualified === true) {
    const at = activities.disqualifiedAt ?? toIso(candidate.disqualified_at) ?? updated;
    return { outcome: candidate.withdrew === true ? 'withdrawn' : 'not_selected', closedAt: later(at, createdAt) };
  }
  const hired = (candidate.hired_at ?? '') !== '' || candidate.stage_kind === 'hired' || lookup.kindOf(stageRef) === 'hired';
  return hired ? { outcome: 'hired', closedAt: later(toIso(candidate.hired_at) ?? activities.hiredAt ?? updated, createdAt) } : null;
}

/** The application of one Workable candidate (a candidate belongs to one job there, so the ids coincide). */
export function mapApplication(candidate: WorkableCandidate, jobRef: string, activities: MappedActivities, lookup: StageLookup, fallbackAt: string): BuilderApplication {
  const createdAt = toIso(candidate.created_at) ?? fallbackAt;
  const stageRef = lookup.resolve(candidate.stage) ?? lookup.fallback(candidate.stage_kind);
  const closing = closingOf(candidate, stageRef, activities, lookup, createdAt);
  const origin = originOf(candidate);
  const coverLetter = cut(htmlToText(candidate.cover_letter ?? ''), 20_000);
  const stageHistory = activities.stageHistory.length > 0 ? [...activities.stageHistory] : [{ stageRef, enteredAt: createdAt }];
  return {
    ref: candidate.id,
    candidateRef: candidate.id,
    jobRef,
    stageRef,
    createdAt,
    ...(closing === null ? {} : closing),
    ...(origin === undefined ? {} : { origin }),
    ...(coverLetter === '' ? {} : { coverLetter }),
    answers: answersOf(candidate),
    stageHistory,
  };
}
