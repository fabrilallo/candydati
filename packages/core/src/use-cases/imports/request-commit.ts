import { z } from 'zod';
import { ConflictError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineImportUseCase } from './define.js';
import { assertStatus, requireBatch } from './shared.js';
import type { ImportBatch } from '@tt/domain';

/**
 * The user confirms the preview: the batch goes to `importing` and `import.commit` is queued. Nothing is written about
 * candidates here; the commit job writes them and records `import.committed`.
 */
export const requestImportCommit = defineImportUseCase({
  name: 'requestImportCommit',
  input: z.object({ batchId: z.string().min(1) }),
  permission: 'import:manage',
  audit: { skip: 'the commit job records import.committed with the counts' },
  handler: async ({ deps, actor, input }): Promise<ImportBatch> => {
    const batch = await requireBatch(deps, actor.organizationId, input.batchId);
    assertStatus(batch, ['ready']);
    const job = await requireJob(deps, batch.organizationId, batch.jobId);
    if (job.status === 'closed') throw new ConflictError('job_closed');
    const included = (await deps.importItems.listAll(batch.organizationId, batch.id)).filter((item) => item.included);
    if (included.length === 0) throw new ValidationError([{ path: 'items', message: 'nothing_to_import' }]);
    const saved = await deps.imports.save({ ...batch, status: 'importing', counts: { ...batch.counts, included: included.length } });
    try {
      await deps.queue.enqueue('import.commit', { organizationId: batch.organizationId, batchId: batch.id });
    } catch {
      await deps.imports.save({ ...saved, status: 'ready' });
      throw new ConflictError('queue_unavailable');
    }
    return saved;
  },
});
