import type { TaskQueue } from '../../intake-ports.js';

/**
 * Called after the change that brought the application into `stageId` has committed. A failure to enqueue is swallowed:
 * the move or the application stays, only the automation of that stage is lost (the same call is how a reconciliation
 * would re-run it). `runAutomations` re-checks the application when it runs.
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
