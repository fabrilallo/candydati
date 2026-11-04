import {
  AUTOMATION_PREVIEW_LIMIT,
  automationMatchSchema,
  conditionSubjectOf,
  isTimeBased,
  matchesConditions,
  occurrenceOf,
  pipelineStagesOf,
  triggerDueNow,
  type Application,
  type AutomationMatch,
  type AutomationTriggerType,
  type Candidate,
  type Job,
} from '@candydati/domain';
import { z } from 'zod';
import type { AutomationExecution, AutomationRuleDeps } from '../../automation-ports.js';
import { can } from '../../authorization.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { alreadyRan } from './already-ran.js';
import { defineAutomationUseCase } from './define.js';

export interface AutomationPreviewItem {
  readonly applicationId: string;
  readonly candidateId: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Time-based triggers: the rule would act for it at the next scan. Null for event triggers. */
  readonly firesNow: boolean | null;
}

export interface AutomationPreview {
  readonly trigger: AutomationTriggerType;
  readonly matching: number;
  readonly firingNow: number | null;
  /** Null when the caller may not read candidates. */
  readonly items: readonly AutomationPreviewItem[] | null;
}

interface Matched {
  readonly application: Application;
  readonly candidate: Candidate;
}

/** Open applications of the stage whose candidate meets every condition, by date of application (never by merit). */
async function matchingApplications(deps: AutomationRuleDeps, organizationId: string, job: Job, match: AutomationMatch): Promise<readonly Matched[]> {
  const open = (await deps.applications.listByJob(organizationId, job.id)).filter((a) => a.outcome === null && a.stageId === match.stageId);
  const candidates = await deps.candidates.findByIds(organizationId, [...new Set(open.map((a) => a.candidateId))]);
  return open
    .flatMap((application) => {
      const candidate = candidates.find((c) => c.id === application.candidateId);
      return candidate && matchesConditions(match.conditions, conditionSubjectOf(application, candidate)) ? [{ application, candidate }] : [];
    })
    .toSorted((a, b) => a.application.createdAt.getTime() - b.application.createdAt.getTime() || a.application.id.localeCompare(b.application.id));
}

/** What the rule being edited already did for these applications (nothing for a new rule). */
async function pastRuns(deps: AutomationRuleDeps, organizationId: string, job: Job, ruleId: string | undefined, applicationIds: readonly string[]): Promise<readonly AutomationExecution[]> {
  if (ruleId === undefined) return [];
  const rule = await deps.rules.findById(organizationId, ruleId);
  if (!rule || rule.jobId !== job.id) throw new NotFoundError('Automation rule not found.');
  return deps.executions.listByRule(organizationId, ruleId, applicationIds);
}

/**
 * Read-only: who a rule being edited would act for now, before it is saved. Counts the open applications of the stage
 * that meet its conditions and, for a time-based trigger, those it would fire for at the next scan (leaving out what the
 * rule already did when `ruleId` names it). Names come from the job's pipeline, which the caller already reaches (the job
 * scope applies through `requireJob`); a caller without `candidate:read` gets the counts only. No notes, feedback or
 * messages are read, so restricted stages have nothing to hide here. Nothing runs, nothing is queued, nothing is stored.
 */
export const previewAutomation = defineAutomationUseCase({
  name: 'previewAutomation',
  input: automationMatchSchema.extend({ jobId: z.string().min(1), ruleId: z.string().min(1).optional() }),
  permission: 'automation:manage',
  audit: { skip: 'read-only preview: first and last names as the pipeline shows them; opening a profile is what gets audited' },
  handler: async ({ deps, actor, input }): Promise<AutomationPreview> => {
    const { organizationId } = actor;
    const job = await requireJob(deps, organizationId, input.jobId);
    if (!pipelineStagesOf(job.content.process).some((stage) => stage.id === input.stageId)) {
      throw new ValidationError([{ path: 'stageId', message: 'unknown_stage' }]);
    }
    const matched = await matchingApplications(deps, organizationId, job, input);
    const runs = await pastRuns(deps, organizationId, job, input.ruleId, matched.map((m) => m.application.id));
    const now = deps.now();
    const timed = isTimeBased(input.trigger.type);
    const firesNow = ({ application }: Matched): boolean => {
      if (!triggerDueNow(input.trigger, application, job, now)) return false;
      return !alreadyRan(runs, application, input.stageId, occurrenceOf(input.trigger, application, job, ''));
    };
    const items = matched.map((m) => ({ ...m, firesNow: timed ? firesNow(m) : null }));
    return {
      trigger: input.trigger.type,
      matching: matched.length,
      firingNow: timed ? items.filter((item) => item.firesNow).length : null,
      items: can(actor, 'candidate:read')
        ? items.slice(0, AUTOMATION_PREVIEW_LIMIT).map(({ application, candidate, firesNow: fires }) => ({
            applicationId: application.id,
            candidateId: candidate.id,
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            firesNow: fires,
          }))
        : null,
    };
  },
});
