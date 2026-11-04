import {
  conditionSubjectOf,
  hasConditions,
  matchesConditions,
  occurrenceOf,
  triggerDueNow,
  type Application,
  type AutomationRule,
  type Job,
} from '@candydati/domain';
import { z } from 'zod';
import type { AutomationScanDeps } from '../../automation-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { alreadyRan } from './already-ran.js';

export interface TimedScanResult {
  /** Enabled time-based rules looked at. */
  readonly rules: number;
  /** `automation.run` tasks queued by this run. */
  readonly queued: number;
  /** Tasks that could not be queued: the next scan tries again. */
  readonly failed: number;
}

interface Due {
  readonly application: Application;
  readonly occurrence: string;
}

/** One lookup per job within a scan: several rules of a job read the same applications. */
function jobCache(deps: AutomationScanDeps) {
  const jobs = new Map<string, Promise<Job | null>>();
  const applications = new Map<string, Promise<readonly Application[]>>();
  const key = (rule: AutomationRule) => `${rule.organizationId}\u0000${rule.jobId}`;
  return {
    job: (rule: AutomationRule) => {
      if (!jobs.has(key(rule))) jobs.set(key(rule), deps.jobs.findById(rule.organizationId, rule.jobId));
      return jobs.get(key(rule)) as Promise<Job | null>;
    },
    applications: (rule: AutomationRule) => {
      if (!applications.has(key(rule))) applications.set(key(rule), deps.applications.listByJob(rule.organizationId, rule.jobId));
      return applications.get(key(rule)) as Promise<readonly Application[]>;
    },
  };
}

/** The applications of the rule's stage the trigger holds for now, meeting the conditions, that the rule has not acted for yet. */
async function dueFor(deps: AutomationScanDeps, cache: ReturnType<typeof jobCache>, rule: AutomationRule, now: Date): Promise<readonly Due[]> {
  const job = await cache.job(rule);
  if (!job) return [];
  let candidates = (await cache.applications(rule)).filter((a) => a.stageId === rule.stageId && triggerDueNow(rule.trigger, a, job, now));
  if (candidates.length > 0 && hasConditions(rule.conditions)) {
    const people = await deps.candidates.findByIds(rule.organizationId, [...new Set(candidates.map((a) => a.candidateId))]);
    candidates = candidates.filter((a) => {
      const person = people.find((p) => p.id === a.candidateId);
      return person !== undefined && matchesConditions(rule.conditions, conditionSubjectOf(a, person));
    });
  }
  if (candidates.length === 0) return [];
  const runs = await deps.executions.listByRule(rule.organizationId, rule.id, candidates.map((a) => a.id));
  return candidates
    .map((application) => ({ application, occurrence: occurrenceOf(rule.trigger, application, job, '') }))
    .filter(({ application, occurrence }) => !alreadyRan(runs, application, rule.stageId, occurrence));
}

/** Queues one run of one rule; false when the queue refused it. The key keeps a repeat from being queued twice. */
async function queueRun(deps: AutomationScanDeps, rule: AutomationRule, { application, occurrence }: Due): Promise<boolean> {
  const payload = { organizationId: rule.organizationId, applicationId: application.id, stageId: rule.stageId, trigger: rule.trigger.type, occurrence, ruleId: rule.id };
  const singletonKey = `automation:${rule.id}:${application.id}:${application.stageChangedAt.toISOString()}:${occurrence}`;
  return deps.queue.enqueue('automation.run', payload, { singletonKey, replaceFailed: true }).then(
    () => true,
    () => false,
  );
}

/**
 * Hourly system job (`automation.scan`): for every enabled time-based rule (stuck in the stage for N days, response
 * deadline within N days) it finds the open applications of the rule's stage the trigger holds for, that meet the rule's
 * conditions and that the rule has not acted for in this occurrence yet, and queues `automation.run` for each, naming the
 * rule. It writes nothing itself: `runAutomations` checks everything again, claims the occurrence and acts. Running the
 * scan twice queues nothing new once the runs are recorded; a task still waiting is not queued twice (singleton key).
 */
export const scanTimedAutomations = defineSystemJob<AutomationScanDeps, z.ZodObject<{ now: z.ZodDate }>, TimedScanResult>({
  name: 'scanTimedAutomations',
  input: z.object({ now: z.date() }),
  handler: async ({ deps, input }): Promise<TimedScanResult> => {
    const rules = await deps.rules.listEnabledTimeBasedAcrossOrganizations();
    const cache = jobCache(deps);
    let queued = 0;
    let failed = 0;
    for (const rule of rules) {
      for (const due of await dueFor(deps, cache, rule, input.now)) {
        if (await queueRun(deps, rule, due)) queued += 1;
        else failed += 1;
      }
    }
    return { rules: rules.length, queued, failed };
  },
});
