import type { ImportBatchDto, ImportBatchPageDto, ImportBatchSummary } from '@tt/core';
import { describeImportBatches, toImportBatchDto } from '@tt/core';
import type { ImportBatch } from '@tt/domain';
import type { AppContext } from '../app-context.js';

/** The batch as the web shows it: the DTO plus the core read model (target job, author by name, column samples). */
export interface ImportBatchView extends ImportBatchDto, Omit<ImportBatchSummary, 'batch'> {}

const toView = ({ batch, ...summary }: ImportBatchSummary): ImportBatchView => ({ ...toImportBatchDto(batch), ...summary });

/** Thin adapter over `describeImportBatches`: the batches were returned to `organizationId` by a use case. */
export async function toBatchViews(ctx: AppContext, organizationId: string, batches: readonly ImportBatch[], withSamples = false): Promise<readonly ImportBatchView[]> {
  return (await describeImportBatches(ctx.importDeps, organizationId, batches, { withSamples })).map(toView);
}

/** A preview page with its enriched batch. */
export async function toPageView(ctx: AppContext, page: ImportBatchPageDto, batch: ImportBatch): Promise<Omit<ImportBatchPageDto, 'batch'> & { readonly batch: ImportBatchView }> {
  const [view] = await toBatchViews(ctx, batch.organizationId, [batch], true);
  return { ...page, batch: view as ImportBatchView };
}
