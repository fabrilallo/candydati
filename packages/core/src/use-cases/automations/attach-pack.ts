import type { Job } from '@candydati/domain';
import { z } from 'zod';
import { toAuditActor, type Actor } from '../../actor.js';
import { can } from '../../authorization.js';
import type { AutomationRuleRepository } from '../../automation-ports.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import type { PackSources } from '../../pack-ports.js';
import type { AuditLogRepository } from '../../ports.js';
import { requireJob } from '../jobs/shared.js';
import { defineAutomationUseCase } from './define.js';
import { requirePack } from './packs.js';
import { syncPackToJob, type AttachPackResult, type PackCopyDeps } from './pack-copy.js';

export type { AttachPackResult } from './pack-copy.js';

const id = z.string().min(1);

/** Templates bring at most this many packs. */
const MAX_TEMPLATE_PACKS = 20;

const copiedMetadata = (result: AttachPackResult) => ({
  from: { kind: 'pack', packId: result.packId },
  count: result.created.length,
  ruleIds: [...result.created],
  updated: result.updated.length,
  removed: result.removed,
  skipped: result.skipped.length,
});

/**
 * Attaches a pack to a job, or brings the job's copies up to date with it (`syncPackToJob`). The job row is locked for the
 * rest of the transaction, so a double submit cannot leave two sets of copies. Audited as `automation.copied`.
 */
export const attachPack = defineAutomationUseCase({
  name: 'attachPack',
  input: z.object({ jobId: id, packId: id }),
  permission: 'automation:manage',
  audit: {
    action: 'automation.copied',
    target: (_input, result: AttachPackResult) => ({ type: 'job', id: result.jobId }),
    metadata: (_input, result: AttachPackResult) => copiedMetadata(result),
  },
  handler: async ({ deps, actor, input }): Promise<AttachPackResult> => {
    await requireJob(deps, actor.organizationId, input.jobId);
    const pack = await requirePack(deps, actor.organizationId, input.packId);
    const job = await deps.jobs.lock(actor.organizationId, input.jobId, 'update');
    if (!job) throw new NotFoundError('Job not found.');
    return syncPackToJob(deps, actor, pack, job);
  },
});

/**
 * For job creation: copies the template's packs and the packs picked, each once, as the creator's own rules. Someone who
 * may not manage automations gets the template's packs silently left out, and is refused when picking packs.
 */
export async function copyPacksOnCreate(
  deps: { readonly auditLog: AuditLogRepository; readonly automationRules: AutomationRuleRepository; readonly packs?: PackSources | undefined; readonly newId: () => string; readonly now: () => Date },
  actor: Actor,
  job: Job,
  options: { readonly templateId: string | null; readonly packIds: readonly string[] },
): Promise<readonly AttachPackResult[]> {
  const sources = deps.packs;
  if (!sources || !can(actor, 'automation:manage')) return [];
  const fromTemplate = options.templateId ? await sources.templatePacks.listByTemplate(job.organizationId, options.templateId) : [];
  const copyDeps: PackCopyDeps = { ...sources, rules: deps.automationRules, newId: deps.newId, now: deps.now };
  const results: AttachPackResult[] = [];
  for (const packId of [...new Set([...fromTemplate, ...options.packIds])]) {
    const pack = await sources.automationPacks.findById(job.organizationId, packId);
    if (!pack) continue;
    const result = await syncPackToJob(copyDeps, actor, pack, job);
    if (result.created.length > 0) {
      await deps.auditLog.append({ organizationId: job.organizationId, actor: toAuditActor(actor), action: 'automation.copied', target: { type: 'job', id: job.id }, metadata: copiedMetadata(result) });
    }
    results.push(result);
  }
  return results;
}

/** Before creating a job with packs picked: the actor may manage automations and every pack exists. */
export async function assertPacksPickable(deps: { readonly packs?: PackSources | undefined }, actor: Actor, packIds: readonly string[]): Promise<void> {
  if (packIds.length === 0) return;
  if (!can(actor, 'automation:manage')) throw new ForbiddenError();
  const missing = [];
  for (const [index, packId] of packIds.entries()) {
    if (!deps.packs || !(await deps.packs.automationPacks.findById(actor.organizationId, packId))) missing.push({ path: `automationPackIds.${index}`, message: 'unknown_pack' });
  }
  if (missing.length > 0) throw new ValidationError(missing);
}

export const listTemplatePacks = defineAutomationUseCase({
  name: 'listTemplatePacks',
  input: z.object({ templateId: id }),
  permission: 'automation:manage',
  audit: { skip: 'read of organization settings, no personal data' },
  handler: async ({ deps, actor, input }): Promise<readonly string[]> => {
    if (!(await deps.jobTemplates.findById(actor.organizationId, input.templateId))) throw new NotFoundError('Template not found.');
    return deps.templatePacks.listByTemplate(actor.organizationId, input.templateId);
  },
});

/** The packs a template brings, in order. Needs both managing automations and editing templates. */
export const setTemplatePacks = defineAutomationUseCase({
  name: 'setTemplatePacks',
  input: z.object({
    templateId: id,
    packIds: z
      .array(id)
      .max(MAX_TEMPLATE_PACKS)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicate_pack' }),
  }),
  permission: 'automation:manage',
  audit: {
    action: 'job_template.packs_updated',
    target: (input) => ({ type: 'job_template', id: input.templateId }),
    metadata: (input) => ({ packIds: [...input.packIds] }),
  },
  handler: async ({ deps, actor, input }): Promise<readonly string[]> => {
    if (!can(actor, 'job_template:create')) throw new ForbiddenError();
    if (!(await deps.jobTemplates.findById(actor.organizationId, input.templateId))) throw new NotFoundError('Template not found.');
    const unknown = [];
    for (const [index, packId] of input.packIds.entries()) {
      if (!(await deps.automationPacks.findById(actor.organizationId, packId))) unknown.push({ path: `packIds.${index}`, message: 'unknown_pack' });
    }
    if (unknown.length > 0) throw new ValidationError(unknown);
    await deps.templatePacks.replace(actor.organizationId, input.templateId, input.packIds);
    return input.packIds;
  },
});
