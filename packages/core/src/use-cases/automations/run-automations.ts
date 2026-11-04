import {
  AUTOMATION_TRIGGERS,
  conditionSubjectOf,
  hasConditions,
  matchesConditions,
  occurrenceOf,
  requiresCurrentStage,
  triggerDueNow,
  type Application,
  type AutomationRule,
  type Candidate,
  type Job,
} from '@candydati/domain';
import { z } from 'zod';
import { toAuditActor, type Actor } from '../../actor.js';
import type { AutomationRunDeps } from '../../automation-ports.js';
import { inSavepoint } from '../../transaction.js';
import { defineUseCase } from '../../use-case.js';
import { requireApplication } from '../candidates/shared.js';
import { requireJob } from '../jobs/shared.js';
import { currentRole, executeAction, notifyCreatorUnauthorized, notifyFailure } from './rule-actions.js';

export const OCCURRENCE_MAX = 200;

const inputSchema = z.object({
  organizationId: z.string().min(1),
  applicationId: z.string().min(1),
  /** The stage of the rules to run: the one entered, or the one a reply, a feedback or the scan is about. */
  stageId: z.string().min(1),
  /** Absent: `stage_entered` (tasks queued before triggers existed). */
  trigger: z.enum(AUTOMATION_TRIGGERS).default('stage_entered'),
  /** The event that fired (`message:<id>`, `feedback:<id>`); time-based occurrences are computed again here. */
  occurrence: z.string().max(OCCURRENCE_MAX).default(''),
  /** Set by the scan: only this rule, which it found due. */
  ruleId: z.string().min(1).optional(),
});
type RunInput = z.output<typeof inputSchema>;

export type AutomationSkipReason = 'application_not_found' | 'decided' | 'stage_changed';

export interface AutomationRunResult {
  readonly executed: number;
  readonly failed: number;
  readonly skipped: AutomationSkipReason | null;
}

/** Everything a rule is checked against, read once per run. */
interface Subject {
  readonly application: Application;
  readonly candidate: Candidate | null;
  readonly job: Job;
  readonly stageId: string;
  readonly now: Date;
}

/** True when this rule had not run yet for this occurrence of its trigger in this stage entry: the run is now claimed. */
const claimRun = (deps: AutomationRunDeps, rule: AutomationRule, subject: Subject, occurrence: string): Promise<boolean> =>
  deps.executions.claim({
    id: deps.newId(),
    organizationId: rule.organizationId,
    ruleId: rule.id,
    applicationId: subject.application.id,
    stageId: subject.stageId,
    stageEnteredAt: subject.application.stageChangedAt,
    occurrence,
    createdAt: deps.now(),
  });

/**
 * One rule, null when it already ran for this occurrence. Its action runs in a savepoint: a failure (an SQL error
 * included) undoes only what this rule wrote, and the claim, the failure notice and the audit event stay in the
 * transaction, so the other rules go on and the failed one is not retried.
 */
async function runRule(deps: AutomationRunDeps, actor: Actor, rule: AutomationRule, subject: Subject, occurrence: string): Promise<boolean | null> {
  if (!(await claimRun(deps, rule, subject, occurrence))) return null;
  const { application, job } = subject;
  const role = await currentRole(deps, rule);
  let ok = false;
  if (role === null) {
    // Skipped, not sent in the name of someone who is gone: admins are told once.
    await notifyCreatorUnauthorized(deps, rule, application.id);
  } else {
    ok = await inSavepoint(deps, (sp) => executeAction(sp, { rule, role, job, application, occurrence })).then(
      () => true,
      () => false,
    );
    if (!ok) await notifyFailure(deps, rule, application.id, occurrence);
  }
  await deps.auditLog.append({
    organizationId: rule.organizationId,
    actor: toAuditActor(actor),
    action: 'automation.ran',
    target: { type: 'automation_rule', id: rule.id },
    metadata: { applicationId: application.id, action: rule.action.type, trigger: rule.trigger.type, ok },
  });
  return ok;
}

/** The enabled rules of the stage with this trigger; with `ruleId`, that one rule if it still is one of them. */
async function rulesFor(deps: AutomationRunDeps, input: RunInput, jobId: string): Promise<readonly AutomationRule[]> {
  const { organizationId, stageId, trigger } = input;
  if (input.ruleId === undefined) return deps.rules.listEnabledByStage(organizationId, jobId, stageId, trigger);
  const rule = await deps.rules.findById(organizationId, input.ruleId);
  const still = rule !== null && rule.enabled && rule.jobId === jobId && rule.stageId === stageId && rule.trigger.type === trigger;
  return still ? [rule] : [];
}

/** The rule's conditions hold and its trigger still does (a time-based one is checked again: the scan may be stale). */
const applies = (rule: AutomationRule, { application, candidate, job, now }: Subject): boolean =>
  matchesConditions(rule.conditions, conditionSubjectOf(application, candidate ?? { tags: [] })) && triggerDueNow(rule.trigger, application, job, now);

const skip = (skipped: AutomationSkipReason): AutomationRunResult => ({ executed: 0, failed: 0, skipped });

/**
 * Worker use case (system actor, task `automation.run`): runs the enabled rules of one stage whose trigger just fired for
 * an application (it entered the stage, its candidate replied, feedback arrived, or the hourly scan found it stuck or near
 * its response deadline) and whose conditions hold. Re-checks everything when it runs: an application that moved on (for
 * every trigger but feedback), was decided or is gone is skipped. Rules run independently; a failing one notifies its
 * creator (`automation_failed`) and never stops the others or undoes anything. A rule whose creator is no longer a member
 * with the needed permission is skipped (admins are told once); the action runs with the creator's current role. There is
 * no rule that moves or decides, so this can never do either (PRODUCT.md §2.4).
 *
 * Idempotent: each rule records its run for this occurrence (`occurrenceOf`) in the same transaction as what it does, so
 * a redelivered task or a second scan finds the record and neither sends the template nor creates the task again.
 */
export const runAutomations = defineUseCase<AutomationRunDeps, typeof inputSchema, AutomationRunResult>({
  name: 'runAutomations',
  input: inputSchema,
  organizationOf: (input) => input.organizationId,
  permission: { skip: 'system job enqueued after a move, an intake, a reply, a feedback or the scan; the organization scope still applies' },
  audit: { skip: 'each rule execution is audited in the handler as automation.ran' },
  transaction: 'required',
  handler: async ({ deps, actor, input }): Promise<AutomationRunResult> => {
    const { organizationId } = input;
    const application = await requireApplication(deps, organizationId, input.applicationId).catch(() => null);
    if (!application) return skip('application_not_found');
    if (application.outcome !== null) return skip('decided');
    if (requiresCurrentStage(input.trigger) && application.stageId !== input.stageId) return skip('stage_changed');
    const job = await requireJob(deps, organizationId, application.jobId);
    const rules = await rulesFor(deps, input, job.id);
    const needsCandidate = rules.some((rule) => hasConditions(rule.conditions));
    const candidate = needsCandidate ? await deps.candidates.findById(organizationId, application.candidateId) : null;
    const subject: Subject = { application, candidate, job, stageId: input.stageId, now: deps.now() };
    let executed = 0;
    let failed = 0;
    for (const rule of rules.filter((item) => applies(item, subject))) {
      const ran = await runRule(deps, actor, rule, subject, occurrenceOf(rule.trigger, application, job, input.occurrence));
      if (ran === null) continue;
      if (ran) executed += 1;
      else failed += 1;
    }
    return { executed, failed, skipped: null };
  },
});
