import { AUTOMATION_RUNS_DEFAULT, AUTOMATION_RUNS_MAX, triggerOfOccurrence, type AutomationRunDto } from '@candydati/domain';
import { z } from 'zod';
import { can } from '../../authorization.js';
import { NotFoundError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineAutomationUseCase } from './define.js';

/**
 * Read-only: the latest runs of one rule, newest first (default 20, at most 50): when, which kind of trigger
 * occurrence, and for which application. It is a log of what the rule did, never a score or a ranking. The rule's job
 * goes through `requireJob`, so the job scope applies; a rule of another organization is a missing one. Names come
 * from the candidate record as the pipeline shows them, and only with `candidate:read` (otherwise `candidate` is
 * null). No notes, feedback or messages are read, so restricted stages hide nothing here.
 */
export const listAutomationRuns = defineAutomationUseCase({
  name: 'listAutomationRuns',
  input: z.object({ ruleId: z.string().min(1), limit: z.number().int().min(1).max(AUTOMATION_RUNS_MAX).default(AUTOMATION_RUNS_DEFAULT) }),
  permission: 'automation:manage',
  audit: { skip: 'read-only log of rule runs: names as the pipeline shows them; opening a profile is what gets audited' },
  handler: async ({ deps, actor, input }): Promise<readonly AutomationRunDto[]> => {
    const { organizationId } = actor;
    const rule = await deps.rules.findById(organizationId, input.ruleId);
    if (!rule) throw new NotFoundError('Automation rule not found.');
    await requireJob(deps, organizationId, rule.jobId);
    const runs = await deps.executions.listRecentByRule(organizationId, rule.id, input.limit);
    const applications = await Promise.all([...new Set(runs.map((run) => run.applicationId))].map((id) => deps.applications.findById(organizationId, id)));
    const candidateOf = new Map(applications.flatMap((a) => (a ? [[a.id, a.candidateId] as const] : [])));
    const people = can(actor, 'candidate:read') ? await deps.candidates.findByIds(organizationId, [...new Set(candidateOf.values())]) : [];
    return runs.map((run) => {
      const person = people.find((c) => c.id === candidateOf.get(run.applicationId));
      return {
        id: run.id,
        at: run.createdAt.toISOString(),
        trigger: triggerOfOccurrence(run.occurrence),
        applicationId: run.applicationId,
        candidate: person ? { id: person.id, firstName: person.firstName, lastName: person.lastName } : null,
      };
    });
  },
});
