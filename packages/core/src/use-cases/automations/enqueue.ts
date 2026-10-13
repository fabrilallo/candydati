import type { TaskQueue } from '../../intake-ports.js';

/**
 * For the change that brought the application into `stageId`. Inside a unit of work the task is sent after the commit
 * (the worker must find the new stage) and a failure goes to the transaction's error sink; outside one, a failure to
 * enqueue is swallowed. Either way the move or the application stays, only the automation of that stage is lost.
 * `runAutomations` re-checks the application when it runs, and runs each rule once per stage entry.
 */
export async function enqueueAutomations(
  deps: { readonly queue: TaskQueue },
  organizationId: string,
  applicationId: string,
  stageId: string,
): Promise<void> {
  try {
    await deps.queue.enqueue('automation.run', { organizationId, applicationId, stageId });
  } catch {
    // Nothing to undo: the stage change is already stored.
  }
}
