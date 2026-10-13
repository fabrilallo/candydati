import { jobSlug, type Job } from '@tt/domain';
import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import { defineJobUseCase } from './define.js';
import { parseContent, withStageIds } from './shared.js';

const SLUG_SUFFIX_LENGTH = 6;

const inputSchema = z.object({
  /** Raw content: validated with `jobContentSchema` after the optional template merge. */
  content: z.record(z.string(), z.unknown()),
  templateId: z.string().min(1).optional(),
});

/** Keys of `overrides` whose value is not `undefined` replace the same key of `base`; nested objects are replaced whole. */
export const mergeContent = (base: object, overrides: Record<string, unknown>): Record<string, unknown> => ({
  ...base,
  ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
});

/**
 * Creates a draft. With `templateId` the template's content is the base and the given content overrides it
 * field by field (top-level keys; a given `salary` or `process` replaces the template's whole). The merged
 * result is validated, so a template makes `title` optional in the given content.
 */
export const createJob = defineJobUseCase({
  name: 'createJob',
  input: inputSchema,
  permission: 'job:create',
  audit: {
    action: 'job.created',
    target: (_input, job: Job) => ({ type: 'job', id: job.id }),
    metadata: (_input, job: Job) => ({ title: job.content.title }),
  },
  handler: async ({ deps, actor, input }): Promise<Job> => {
    const template = input.templateId ? await deps.jobTemplates.findById(actor.organizationId, input.templateId) : null;
    if (input.templateId && !template) throw new NotFoundError('Template not found.');
    const content = withStageIds(parseContent(template ? mergeContent(template.content, input.content) : input.content), deps.newId);
    const id = deps.newId();
    const now = deps.now();
    return deps.jobs.create({
      id,
      organizationId: actor.organizationId,
      slug: jobSlug(content.title, id.slice(0, SLUG_SUFFIX_LENGTH)),
      status: 'draft',
      content,
      quality: null,
      // The person behind an agent or API key owns the ad (deadline reminders go to them), never the key.
      createdBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      closedAt: null,
    });
  },
});
