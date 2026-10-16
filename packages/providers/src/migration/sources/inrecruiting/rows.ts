import { IMPORT_NOTE_MAX, JOB_TITLE_MAX, ORIGIN_MAX, STAGE_TITLE_MAX, TAGS_PER_CANDIDATE_MAX, TAG_MAX, normalizeEmail, normalizeText, safePersonNameOrEmpty, splitFullName, type Outcome } from '@candydati/domain';
import type { ImportRow } from '../../../import/index.js';
import type { InrecruitingColumns } from './columns.js';
import { parseSheetDate } from './dates.js';
import { outcomeOf } from './outcomes.js';

/** One row of the sheet, read and cleaned: one application. */
export interface SheetRow {
  readonly index: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly jobTitle: string;
  readonly jobCode: string | null;
  /** Null when the cell is empty or holds an outcome word (the application then sits in the job's last stage). */
  readonly stage: string | null;
  readonly outcome: Outcome | null;
  readonly appliedAt: string | null;
  readonly source: string | null;
  readonly note: string | null;
  readonly tags: readonly string[];
  readonly fileCell: string | null;
  /** Values that were there but unusable (a malformed email, phone or date). */
  readonly dropped: number;
}

export type RowResult = { readonly row: SheetRow } | { readonly skipped: true };

const clean = (value: string | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
const orNull = (value: string): string | null => (value === '' ? null : value);
const clip = (value: string, max: number): string => Array.from(value).slice(0, max).join('');
const cell = (row: ImportRow, header: string | null): string => (header === null ? '' : clean(row[header]));

/** Accepts what a phone field accepts in the package; a dot or slash is punctuation, anything else is dropped. */
function cleanPhone(value: string): string | null {
  const phone = value.replace(/[./]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^\+?[0-9 ()-]{6,20}$/.test(phone) ? phone : null;
}

const splitTags = (value: string): readonly string[] =>
  [...new Set(value.split(/[,;|\n]+/).map((tag) => clip(tag.trim().toLowerCase(), TAG_MAX)).filter((tag) => tag !== ''))].slice(0, TAGS_PER_CANDIDATE_MAX);

function nameOf(row: ImportRow, columns: InrecruitingColumns): { firstName: string; lastName: string } {
  const full = cell(row, columns.fullName);
  const split = full === '' ? null : splitFullName(full);
  return {
    firstName: safePersonNameOrEmpty(cell(row, columns.firstName) || split?.firstName || ''),
    lastName: safePersonNameOrEmpty(cell(row, columns.lastName) || split?.lastName || ''),
  };
}

/** The stage and outcome of a row: the outcome column wins; a status that is an outcome word is an outcome, not a stage. */
function stageAndOutcome(row: ImportRow, columns: InrecruitingColumns): { stage: string | null; outcome: Outcome | null } {
  const stageCell = cell(row, columns.stage);
  const fromStage = outcomeOf(stageCell);
  const fromOutcome = outcomeOf(cell(row, columns.outcome));
  return { stage: stageCell === '' || fromStage !== null ? null : clip(stageCell, STAGE_TITLE_MAX), outcome: fromOutcome ?? fromStage };
}

/** Reads one row. A row without a usable full name or without a job is skipped: it cannot be an application. */
export function readRow(row: ImportRow, index: number, columns: InrecruitingColumns): RowResult {
  const { firstName, lastName } = nameOf(row, columns);
  const jobTitle = clip(cell(row, columns.job), JOB_TITLE_MAX);
  if (firstName === '' || lastName === '' || jobTitle === '') return { skipped: true };
  const emailCell = cell(row, columns.email);
  const email = normalizeEmail(emailCell);
  const phoneCell = cell(row, columns.phone);
  const phone = phoneCell === '' ? null : cleanPhone(phoneCell);
  const dateCell = cell(row, columns.appliedAt);
  const appliedAt = dateCell === '' ? null : parseSheetDate(dateCell);
  const noteCell = columns.notes === null ? '' : (row[columns.notes] ?? '').trim();
  const dropped = [emailCell !== '' && email === null, phoneCell !== '' && phone === null, dateCell !== '' && appliedAt === null].filter(Boolean).length;
  return {
    row: {
      index,
      firstName,
      lastName,
      email,
      phone,
      jobTitle,
      jobCode: orNull(clip(cell(row, columns.jobCode), 60)),
      ...stageAndOutcome(row, columns),
      appliedAt,
      source: orNull(clip(cell(row, columns.source), ORIGIN_MAX)),
      note: orNull(clip(noteCell, IMPORT_NOTE_MAX)),
      tags: splitTags(cell(row, columns.tags)),
      fileCell: orNull(cell(row, columns.file)),
      dropped,
    },
  };
}

/** Same title and same code (when there is one), ignoring case, accents and punctuation: the same job. */
export const jobKeyOf = (row: SheetRow): string => `${normalizeText(row.jobTitle)}|${normalizeText(row.jobCode ?? '')}`;
