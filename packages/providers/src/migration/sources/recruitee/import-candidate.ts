import { JsonReaderError } from '../../../http/index.js';
import { PackageBuilderError, type BuilderFile, type PackageBuilder } from '../../package-builder.js';
import type { RecruiteeCandidateDetail, RecruiteeClient } from './client.js';
import { candidateRef, isDeleted, isRetentionOver, mapCandidate, mapNote, mapPlacement, isoDate, type JobCollector } from './map.js';
import type { RecruiteeHit } from './schemas.js';

const COVER_LETTER_MAX = 20_000;
const ATTACHMENTS_PER_CANDIDATE_MAX = 20;

/** Counters only: what the run skipped and why, never a record, a name or a URL. */
export interface RecruiteeStats {
  readonly candidates: number;
  readonly applications: number;
  readonly notes: number;
  readonly files: number;
  readonly skipped: Readonly<Record<string, number>>;
}

export interface ImportContext {
  readonly client: RecruiteeClient;
  readonly builder: PackageBuilder;
  readonly jobs: JobCollector;
  readonly now: Date;
}

export interface RunStats {
  candidates: number;
  applications: number;
  notes: number;
  files: number;
  skipped: Record<string, number>;
}

export const emptyStats = (): RunStats => ({ candidates: 0, applications: 0, notes: 0, files: 0, skipped: {} });
const leftOut = (stats: RunStats, reason: string): false => {
  skip(stats, reason);
  return false;
};
const skip = (stats: RunStats, reason: string): void => {
  stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
};

interface FileCandidate {
  readonly file: BuilderFile;
  readonly url: string;
}

function fileNameOf(url: URL, fallback: string): string {
  const last = decodeURIComponent(url.pathname.split('/').pop() ?? '');
  return last.trim() === '' ? fallback : last;
}

function fileUrl(value: string | null | undefined): URL | null {
  try {
    const url = new URL((value ?? '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** The CV (original first, else the parsed one) and the attachments the detail lists, when it lists any. */
export function filesOf(detail: RecruiteeCandidateDetail): readonly FileCandidate[] {
  const cvUrl = fileUrl(detail.cv_original_url) ?? fileUrl(detail.cv_url);
  const cv: readonly FileCandidate[] = cvUrl ? [{ file: { kind: 'cv', fileName: fileNameOf(cvUrl, 'cv') }, url: cvUrl.href }] : [];
  const others = (detail.attachments ?? []).flatMap((attachment) => {
    const url = fileUrl(attachment.url ?? attachment.file_url);
    if (!url || url.href === cvUrl?.href) return [];
    const name = [attachment.name, attachment.file_name, attachment.filename].find((n) => n?.trim());
    return [{ file: { kind: 'other', fileName: name?.trim() || fileNameOf(url, 'attachment') } satisfies BuilderFile, url: url.href }];
  });
  return [...cv, ...others.slice(0, ATTACHMENTS_PER_CANDIDATE_MAX)];
}

/** Downloads right after the record was read (URLs expire); a file that fails is skipped, the migration goes on. */
async function addFiles(ctx: ImportContext, applicationRef: string, files: readonly FileCandidate[], stats: RunStats): Promise<void> {
  for (const { file, url } of files) {
    try {
      await ctx.builder.addFile(applicationRef, file, (store) => ctx.client.download(url, store));
      stats.files += 1;
    } catch (error) {
      if (!(error instanceof JsonReaderError || error instanceof PackageBuilderError)) throw error;
      skip(stats, `file_${error instanceof JsonReaderError ? error.code : error.code}`);
    }
  }
}

function addApplications(ctx: ImportContext, hit: RecruiteeHit, detail: RecruiteeCandidateDetail | null, createdAt: string, stats: RunStats): readonly string[] {
  const coverLetter = detail?.cover_letter?.trim().slice(0, COVER_LETTER_MAX);
  const added: string[] = [];
  for (const placement of hit.placements ?? []) {
    const mapped = mapPlacement(hit, placement, createdAt);
    if (mapped === null) {
      skip(stats, 'placement_without_offer');
      continue;
    }
    const withLetter = added.length === 0 && coverLetter ? { ...mapped.application, coverLetter } : mapped.application;
    try {
      ctx.builder.addApplication(withLetter);
    } catch (error) {
      if (!(error instanceof PackageBuilderError)) throw error;
      skip(stats, 'application_refused');
      continue;
    }
    ctx.jobs.notePlacement(placement, createdAt);
    added.push(mapped.application.ref);
    stats.applications += 1;
  }
  return added;
}

async function addNotes(ctx: ImportContext, hit: RecruiteeHit, createdAt: string, stats: RunStats): Promise<void> {
  const notes = await ctx.client.notes(hit.id);
  for (const note of notes ?? []) {
    const mapped = mapNote(note, candidateRef(hit), createdAt);
    if (mapped === null) continue;
    try {
      ctx.builder.addNote(mapped);
      stats.notes += 1;
    } catch (error) {
      if (!(error instanceof PackageBuilderError)) throw error;
      skip(stats, 'note_refused');
    }
  }
}

/** One search hit into the builder. Returns false when the candidate was left out. */
export async function importHit(ctx: ImportContext, hit: RecruiteeHit, stats: RunStats): Promise<boolean> {
  if (isDeleted(hit)) return leftOut(stats, 'deleted');
  if (isRetentionOver(hit, ctx.now)) return leftOut(stats, 'retention_over');
  const detail = await ctx.client.candidateDetail(hit.id);
  const createdAt = isoDate(hit.created_at) ?? ctx.now.toISOString();
  try {
    ctx.builder.addCandidate(mapCandidate(hit, detail?.links ?? [], createdAt));
  } catch (error) {
    if (!(error instanceof PackageBuilderError)) throw error;
    return leftOut(stats, 'candidate_refused');
  }
  stats.candidates += 1;
  const applications = addApplications(ctx, hit, detail, createdAt, stats);
  await addNotes(ctx, hit, createdAt, stats);
  const first = applications[0];
  if (detail && first !== undefined) await addFiles(ctx, first, filesOf(detail), stats);
  else if (detail && filesOf(detail).length > 0) skip(stats, 'files_without_application');
  return true;
}
