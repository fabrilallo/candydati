import {
  toTrackedLinkDto,
  trackedLinkInputSchema,
  trackedLinkKey,
  TRACKED_LINKS_MAX,
  type SavedTrackedLinkDto,
  type TrackedLinkDto,
} from '@candydati/domain';
import { z } from 'zod';
import { toActorUserId } from '../../actor-user.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import type { TrackedLinkDeps } from '../../tracked-link-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';
import { requireJob } from '../jobs/shared.js';

const defineTrackedLinkUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<TrackedLinkDeps, S, O>): UseCase<TrackedLinkDeps, O> =>
  defineUseCase<TrackedLinkDeps, S, O>(definition);

const jobIdSchema = z.string().min(1).max(200);

/** The tracked links saved on a job, oldest first. Distribution is for the people who publish ads. */
export const listTrackedLinks = defineTrackedLinkUseCase({
  name: 'listTrackedLinks',
  input: z.object({ jobId: jobIdSchema }),
  permission: 'job:publish',
  audit: { skip: 'read-only; channel names of an ad, no candidate data' },
  handler: async ({ deps, actor, input }): Promise<readonly TrackedLinkDto[]> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    return (await deps.trackedLinks.listByJob(actor.organizationId, job.id)).map(toTrackedLinkDto);
  },
});

/**
 * Saves a tracked link for one channel and campaign. Saving a pair the job already has answers with that link
 * (`created: false`) and changes nothing, so it is not audited again.
 */
export const createTrackedLink = defineTrackedLinkUseCase({
  name: 'createTrackedLink',
  input: trackedLinkInputSchema.extend({ jobId: jobIdSchema }),
  permission: 'job:publish',
  audit: {
    action: (_input, result: SavedTrackedLinkDto) => (result.created ? 'job.tracked_link_created' : null),
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (_input, result: SavedTrackedLinkDto) => ({ linkId: result.link.id, source: result.link.source, campaign: result.link.campaign }),
  },
  handler: async ({ deps, actor, input }): Promise<SavedTrackedLinkDto> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const key = trackedLinkKey(input);
    if (key === null) throw new ValidationError([{ path: 'source', message: 'invalid_channel' }]);
    const existing = (await deps.trackedLinks.listByJob(actor.organizationId, job.id)).find((link) => link.source === key.source && link.campaign === key.campaign);
    if (existing) return { link: toTrackedLinkDto(existing), created: false };
    if ((await deps.trackedLinks.countByJob(actor.organizationId, job.id)) >= TRACKED_LINKS_MAX) {
      throw new ValidationError([{ path: 'source', message: 'too_many_tracked_links' }]);
    }
    const saved = await deps.trackedLinks.insertIfAbsent({
      id: deps.newId(),
      organizationId: actor.organizationId,
      jobId: job.id,
      ...key,
      createdBy: toActorUserId(actor),
      createdAt: deps.now(),
    });
    return { link: toTrackedLinkDto(saved.link), created: saved.created };
  },
});

/** Removes a saved link. Applications that came through it keep their origin: the reports do not change. */
export const removeTrackedLink = defineTrackedLinkUseCase({
  name: 'removeTrackedLink',
  input: z.object({ jobId: jobIdSchema, linkId: z.string().min(1).max(200) }),
  permission: 'job:publish',
  audit: {
    action: 'job.tracked_link_removed',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (input) => ({ linkId: input.linkId }),
  },
  handler: async ({ deps, actor, input }): Promise<{ readonly removed: true }> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (!(await deps.trackedLinks.remove(actor.organizationId, job.id, input.linkId))) throw new NotFoundError('Tracked link not found.');
    return { removed: true };
  },
});
