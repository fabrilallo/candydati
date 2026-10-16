import { applyStageChoices, migrationStageChoiceSchema, migrationStageNameChoiceSchema, type MigrationBatch } from '@candydati/domain';
import { z } from 'zod';
import { ValidationError } from '../../errors.js';
import { defineMigrationUseCase } from './define.js';
import { byMigrationId } from './queries.js';
import { assertMigrationStatus, requireMigration } from './shared.js';

const choicesInput = byMigrationId
  .extend({
    /** Choices for single stages of the package; the others keep what they had. */
    stageMapping: z.array(migrationStageChoiceSchema).max(10_000).optional(),
    /** The same choice for every stage, in every job, with this source name (compared like the analysis does). */
    stageNames: z.array(migrationStageNameChoiceSchema).max(1_000).optional(),
    /** Replaces the list of package jobs left out. */
    excludedJobs: z.array(z.string().min(1).max(120)).max(10_000).optional(),
    /** People whose retention expired never come across (ADR 0009, decision 2): only `false` is accepted. */
    includeExpired: z.literal(false).optional(),
  })
  .strict();

function checkJobs(batch: MigrationBatch, excludedJobs: readonly string[]): readonly string[] {
  const known = new Set((batch.counts.perJob ?? []).map((job) => job.jobRef));
  const unknown = excludedJobs.filter((ref) => !known.has(ref));
  if (unknown.length > 0) throw new ValidationError([{ path: 'excludedJobs', message: `unknown_job: ${unknown.join(', ')}` }]);
  return [...new Set(excludedJobs)];
}

/**
 * Task 3.3: the operator's choices in the preview: where each stage lands (one stage, or every stage with a given source
 * name across jobs; stages of a job mapped to the same type and title become one) and which jobs stay behind. Only on a
 * `ready` batch, compare-and-set on that status, so a choice and the start of the commit never both win. People whose
 * retention expired stay out whatever is asked.
 */
export const updateMigrationChoices = defineMigrationUseCase({
  name: 'updateMigrationChoices',
  input: choicesInput,
  permission: 'migration:manage',
  audit: { skip: 'preview: nothing is written about candidates until the commit, which audits the choices it applies' },
  handler: async ({ deps, actor, input }): Promise<MigrationBatch> => {
    const batch = await requireMigration(deps, actor.organizationId, input.migrationId);
    assertMigrationStatus(batch, ['ready']);
    const applied = applyStageChoices(batch.stageMapping, { stages: input.stageMapping, byName: input.stageNames });
    if (!applied.ok) throw new ValidationError(applied.issues);
    const excludedJobs = input.excludedJobs === undefined ? batch.excludedJobs : checkJobs(batch, input.excludedJobs);
    return deps.migrations.transition(batch.organizationId, batch.id, 'ready', { stageMapping: applied.mapping, excludedJobs, updatedAt: deps.now() });
  },
});
