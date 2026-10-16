import { nameKey, normalizeText, type MigrationFetchNotice } from '@candydati/domain';
import type { ImportRow } from '../../../import/index.js';
import type { BuilderApplication, BuilderCandidate, BuilderJob, BuilderNote } from '../../package-builder.js';
import type { ColumnDetection } from './columns.js';
import type { CvSubject } from './cv-match.js';
import { jobKeyOf, readRow, type SheetRow } from './rows.js';

/** The default stage of an application whose job names none. Stages can be renamed or merged in the preview. */
export const DEFAULT_STAGE_NAME = 'Candidatura';

export interface MappedSheet {
  readonly jobs: readonly BuilderJob[];
  readonly candidates: readonly BuilderCandidate[];
  readonly applications: readonly BuilderApplication[];
  readonly notes: readonly BuilderNote[];
  /** What the CV matching needs, one per application. */
  readonly subjects: readonly CvSubject[];
  readonly notices: readonly MigrationFetchNotice[];
}

interface JobDraft {
  readonly ref: string;
  readonly title: string;
  /** Stage names in order of first appearance, by normalised name. */
  readonly stages: ReadonlyMap<string, string>;
  readonly rows: readonly SheetRow[];
}

const emailOrNameKey = (row: SheetRow): string => (row.email !== null ? `e:${row.email}` : `n:${nameKey(`${row.firstName} ${row.lastName}`)}`);
const earliest = (dates: readonly string[]): string | null => dates.toSorted()[0] ?? null;
const latest = (dates: readonly string[]): string | null => dates.toSorted().at(-1) ?? null;

/** Groups rows by job (title plus code), dropping a second row of the same person for the same job. */
function groupByJob(rows: readonly SheetRow[]): { readonly jobs: readonly JobDraft[]; readonly duplicates: number } {
  const byKey = new Map<string, JobDraft>();
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const key = jobKeyOf(row);
    const person = `${key}#${emailOrNameKey(row)}`;
    if (seen.has(person)) {
      duplicates += 1;
      continue;
    }
    seen.add(person);
    const job = byKey.get(key) ?? { ref: `job-${byKey.size + 1}`, title: row.jobTitle, stages: new Map<string, string>(), rows: [] };
    const stages = row.stage === null || job.stages.has(normalizeText(row.stage)) ? job.stages : new Map([...job.stages, [normalizeText(row.stage), row.stage]]);
    byKey.set(key, { ...job, stages, rows: [...job.rows, row] });
  }
  return { jobs: [...byKey.values()], duplicates };
}

const stageRefOf = (job: JobDraft, name: string): string => `${job.ref}-s${[...job.stages.keys()].indexOf(normalizeText(name)) + 1}`;

/** A job that no row gives stages to still needs one: applications must sit somewhere. */
const withStages = (job: JobDraft): JobDraft => (job.stages.size > 0 ? job : { ...job, stages: new Map([[normalizeText(DEFAULT_STAGE_NAME), DEFAULT_STAGE_NAME]]) });

function toBuilderJob(job: JobDraft, exportedAt: string): BuilderJob {
  const created = earliest(job.rows.map((row) => row.appliedAt ?? exportedAt)) ?? exportedAt;
  const decided = job.rows.every((row) => row.outcome !== null);
  const closedAt = latest(job.rows.map((row) => (row.outcome === null ? '' : (row.appliedAt ?? exportedAt))).filter((date) => date !== ''));
  return {
    ref: job.ref,
    title: job.title,
    // Every application decided: the job is history. Otherwise a draft, never published by the migration itself.
    status: decided ? 'closed' : 'draft',
    createdAt: created,
    ...(decided && closedAt !== null ? { closedAt } : {}),
    stages: [...job.stages.values()].map((name, index) => ({ ref: `${job.ref}-s${index + 1}`, name })),
  };
}

function toBuilderCandidates(rows: readonly SheetRow[], exportedAt: string): { readonly candidates: readonly BuilderCandidate[]; readonly refOf: ReadonlyMap<string, string> } {
  const byPerson = new Map<string, SheetRow[]>();
  for (const row of rows) byPerson.set(emailOrNameKey(row), [...(byPerson.get(emailOrNameKey(row)) ?? []), row]);
  const refOf = new Map<string, string>();
  const candidates = [...byPerson].map(([key, own], index): BuilderCandidate => {
    const first = own[0] as SheetRow;
    const ref = `candidate-${index + 1}`;
    refOf.set(key, ref);
    const phone = own.find((row) => row.phone !== null)?.phone;
    return {
      ref,
      firstName: first.firstName,
      lastName: first.lastName,
      ...(first.email === null ? {} : { email: first.email }),
      ...(phone === undefined || phone === null ? {} : { phone }),
      tags: [...new Set(own.flatMap((row) => row.tags))].slice(0, 20),
      createdAt: earliest(own.map((row) => row.appliedAt ?? exportedAt)) ?? exportedAt,
    };
  });
  return { candidates, refOf };
}

function toApplication(job: JobDraft, row: SheetRow, candidateRef: string, exportedAt: string): BuilderApplication {
  const createdAt = row.appliedAt ?? exportedAt;
  // An outcome word in the status column names no stage: the application sits in the job's last one.
  const stageName = row.stage ?? [...job.stages.values()].at(-1) ?? DEFAULT_STAGE_NAME;
  return {
    ref: `application-${row.index + 1}`,
    candidateRef,
    jobRef: job.ref,
    stageRef: stageRefOf(job, stageName),
    createdAt,
    ...(row.outcome === null ? {} : { outcome: row.outcome, closedAt: createdAt }),
    ...(row.source === null ? {} : { origin: row.source }),
  };
}

const noticeIf = (code: MigrationFetchNotice['code'], count: number, headers?: readonly string[]): readonly MigrationFetchNotice[] =>
  count === 0 ? [] : [{ code, count, ...(headers === undefined ? {} : { headers: [...headers].slice(0, 30).map((header) => header.slice(0, 100)) }) }];

/**
 * One row is one application. Jobs are the distinct job titles (plus code when present); each job's stages are the
 * distinct status values of its rows in order of first appearance; people are merged by email, or by name when there is
 * no email. Pure: no I/O, no value other than what the package takes. Rows that cannot be an application (no usable name
 * or no job) are skipped and counted.
 */
export function mapSheet(rows: readonly ImportRow[], detection: ColumnDetection, exportedAt: string): MappedSheet {
  const read = rows.map((row, index) => readRow(row, index, detection.columns));
  const usable = read.flatMap((result) => ('row' in result ? [result.row] : []));
  const { jobs: grouped, duplicates } = groupByJob(usable);
  const drafts = grouped.map(withStages);
  const { candidates, refOf } = toBuilderCandidates(drafts.flatMap((job) => job.rows), exportedAt);
  const applications = drafts.flatMap((job) => job.rows.map((row) => toApplication(job, row, refOf.get(emailOrNameKey(row)) ?? '', exportedAt)));
  const rowOf = new Map(drafts.flatMap((job) => job.rows).map((row) => [`application-${row.index + 1}`, row]));
  const notes = applications.flatMap((application): BuilderNote[] => {
    const note = rowOf.get(application.ref)?.note;
    return note === null || note === undefined ? [] : [{ candidateRef: application.candidateRef, applicationRef: application.ref, authorName: 'InRecruiting', body: note, createdAt: application.createdAt }];
  });
  const subjects = applications.map((application): CvSubject => {
    const row = rowOf.get(application.ref) as SheetRow;
    return { applicationRef: application.ref, candidateRef: application.candidateRef, fileCell: row.fileCell, email: row.email, fullName: `${row.firstName} ${row.lastName}` };
  });
  return {
    jobs: drafts.map((job) => toBuilderJob(job, exportedAt)),
    candidates,
    applications,
    notes,
    subjects,
    notices: [
      ...noticeIf('columns_unrecognized', detection.unrecognized.length, detection.unrecognized),
      ...noticeIf('columns_ignored', detection.ignored.length, detection.ignored),
      ...noticeIf('rows_skipped', read.length - usable.length),
      ...noticeIf('rows_duplicate', duplicates),
      ...noticeIf('values_dropped', usable.reduce((sum, row) => sum + row.dropped, 0)),
    ],
  };
}
