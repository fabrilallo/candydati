import type { TaskQueue } from '../../intake-ports.js';
import { afterCommitOrNow, baseDeps, type TransactionalDeps } from '../../transaction.js';

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

/**
 * For the change that brought the application into `stageId`. Inside a unit of work the task is sent after the commit
 * (the worker must find the new stage); outside one, right away. A failure never undoes the move or the application:
 * only the automation of that stage is lost, so it is reported (ids only) to the transaction's error sink instead of
 * being swallowed. `runAutomations` re-checks the application when it runs, and runs each rule once per stage entry.
 */
export async function enqueueAutomations(
  deps: { readonly queue: TaskQueue } & Partial<TransactionalDeps>,
  organizationId: string,
  applicationId: string,
  stageId: string,
): Promise<void> {
  const queue = baseDeps(deps).queue;
  await afterCommitOrNow(deps, async () => {
    try {
      await queue.enqueue('automation.run', { organizationId, applicationId, stageId });
    } catch (error) {
      deps.transaction?.onEffectError?.(new AutomationEnqueueError({ organizationId, applicationId, stageId }, error));
    }
  });
}
