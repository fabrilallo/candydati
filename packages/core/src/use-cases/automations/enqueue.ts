import type { AutomationTriggerType } from '@candydati/domain';
import type { AutomationRunPayload, TaskQueue } from '../../intake-ports.js';
import { afterCommitOrNow, baseDeps, queuesInTransaction, type TransactionalDeps } from '../../transaction.js';

/** An automation that could not be queued. Ids only, so it can go to the logs as it is. */
export class AutomationEnqueueError extends Error {
  constructor(
    readonly context: { readonly organizationId: string; readonly applicationId: string; readonly stageId: string },
    cause: unknown,
  ) {
    super('automation.run could not be queued', { cause });
    this.name = 'AutomationEnqueueError';
  }
}

/** An event trigger and its occurrence (`message:<id>`, `feedback:<id>`). Absent: the application entered the stage. */
export interface AutomationEvent {
  readonly trigger: Exclude<AutomationTriggerType, 'stage_entered' | 'stage_stuck' | 'response_due_soon'>;
  readonly occurrence: string;
}

/**
 * For the change that fired a trigger on an application of `stageId`: it entered it (no `event`), its candidate replied,
 * or feedback arrived. Inside a unit of work that owns the queue (pg-boss on its connection) the task is inserted with
 * the change; with another queue it is sent after the commit (the worker must find what was written); outside one, right
 * away. A failure never undoes the change: only the automations of that occurrence are lost, so it is reported (ids only)
 * to the transaction's error sink instead of being swallowed. `runAutomations` re-checks the application when it runs,
 * and runs each rule once per occurrence.
 */
export async function enqueueAutomations(
  deps: { readonly queue: TaskQueue } & Partial<TransactionalDeps>,
  organizationId: string,
  applicationId: string,
  stageId: string,
  event?: AutomationEvent,
): Promise<void> {
  const payload: AutomationRunPayload = { organizationId, applicationId, stageId, ...(event ? { trigger: event.trigger, occurrence: event.occurrence } : {}) };
  if (queuesInTransaction(deps)) {
    // Inserted with the change: the task exists if and only if the change commits.
    await deps.queue.enqueue('automation.run', payload);
    return;
  }
  const queue = baseDeps(deps).queue;
  await afterCommitOrNow(deps, async () => {
    try {
      await queue.enqueue('automation.run', payload);
    } catch (error) {
      deps.transaction?.onEffectError?.(new AutomationEnqueueError({ organizationId, applicationId, stageId }, error));
    }
  });
}
