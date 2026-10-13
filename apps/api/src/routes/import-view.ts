import type { ImportBatchDto, ImportBatchPageDto } from '@tt/core';
import { toImportBatchDto } from '@tt/core';
import type { ImportBatch } from '@tt/domain';
import type { AppContext } from '../app-context.js';

export const SAMPLES_PER_COLUMN = 3;
const SAMPLE_MAX_CHARS = 80;

/** The batch as the web shows it: the target job and who started it, by name. */
export interface ImportBatchView extends ImportBatchDto {
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

/** Adds job and author to every batch with one lookup each; `withSamples` also reads the stored rows (preview only). */
export async function toBatchViews(ctx: AppContext, batches: readonly ImportBatch[], withSamples = false): Promise<readonly ImportBatchView[]> {
  const names = await ctx.userNames([...new Set(batches.map((batch) => batch.createdBy))]);
  const titles = new Map<string, string>();
  for (const batch of batches) {
    if (titles.has(batch.jobId)) continue;
    const job = await ctx.importDeps.jobs.findById(batch.organizationId, batch.jobId);
    if (job) titles.set(batch.jobId, job.content.title);
  }
  const views: ImportBatchView[] = [];
  for (const batch of batches) {
    const analysis = withSamples ? await ctx.importDeps.importAnalyses.find(batch.organizationId, batch.id) : null;
    const title = titles.get(batch.jobId);
    views.push({
      ...toImportBatchDto(batch),
      job: title === undefined ? null : { id: batch.jobId, title },
      createdBy: { id: batch.createdBy, name: names.get(batch.createdBy) ?? '' },
      ...(withSamples ? { columnSamples: analysis ? samplesOf(batch.headers, analysis.rows) : {} } : {}),
    });
  }
  return views;
}

/** A preview page with its enriched batch. */
export async function toPageView(ctx: AppContext, page: ImportBatchPageDto, batch: ImportBatch): Promise<Omit<ImportBatchPageDto, 'batch'> & { readonly batch: ImportBatchView }> {
  const [view] = await toBatchViews(ctx, [batch], true);
  return { ...page, batch: view as ImportBatchView };
}
