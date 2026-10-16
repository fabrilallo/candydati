import type { ImportBatch } from '@candydati/domain';
import type { UserDirectory } from '../../candidate-ports.js';
import type { ImportDeps } from '../../import-ports.js';

export const SAMPLES_PER_COLUMN = 3;
const SAMPLE_MAX_CHARS = 80;

export type ImportSummaryDeps = Pick<ImportDeps, 'jobs' | 'importAnalyses'> & { readonly users: UserDirectory };

/** A batch as the web lists it: the target job and who started it, by name. */
export interface ImportBatchSummary {
  readonly batch: ImportBatch;
  readonly job: { readonly id: string; readonly title: string } | null;
  readonly createdBy: { readonly id: string; readonly name: string };
  /** First values of each column of the sheets (non-empty, shortened), to help pick the mapping. Preview only. */
  readonly columnSamples?: Readonly<Record<string, readonly string[]>>;
}

function samplesOf(headers: readonly string[], rows: readonly { readonly cells: Readonly<Record<string, string>> }[]): Record<string, readonly string[]> {
  return Object.fromEntries(
    headers.map((header) => [
      header,
      rows
        .map((row) => (row.cells[header] ?? '').trim())
        .filter((value) => value !== '')
        .slice(0, SAMPLES_PER_COLUMN)
        .map((value) => value.slice(0, SAMPLE_MAX_CHARS)),
    ]),
  );
}

async function jobTitles(deps: ImportSummaryDeps, organizationId: string, batches: readonly ImportBatch[]): Promise<ReadonlyMap<string, string>> {
  const titles = new Map<string, string>();
  for (const jobId of new Set(batches.map((batch) => batch.jobId))) {
    const job = await deps.jobs.findById(organizationId, jobId);
    if (job) titles.set(jobId, job.content.title);
  }
  return titles;
}

/**
 * Read model of the import screens, for batches a use case already returned to `organizationId`: one lookup per job and
 * one for every author, all scoped to that organization. `withSamples` also reads the stored rows (preview only).
 */
export async function describeImportBatches(
  deps: ImportSummaryDeps,
  organizationId: string,
  batches: readonly ImportBatch[],
  options: { readonly withSamples?: boolean } = {},
): Promise<readonly ImportBatchSummary[]> {
  const names = await deps.users.actorNamesOf(organizationId, [...new Set(batches.map((batch) => batch.createdBy))]);
  const titles = await jobTitles(deps, organizationId, batches);
  const summaries: ImportBatchSummary[] = [];
  for (const batch of batches) {
    const title = titles.get(batch.jobId);
    const base = { batch, job: title === undefined ? null : { id: batch.jobId, title }, createdBy: { id: batch.createdBy, name: names[batch.createdBy] ?? '' } };
    if (!options.withSamples) {
      summaries.push(base);
      continue;
    }
    const analysis = await deps.importAnalyses.find(organizationId, batch.id);
    summaries.push({ ...base, columnSamples: analysis ? samplesOf(batch.headers, analysis.rows) : {} });
  }
  return summaries;
}
