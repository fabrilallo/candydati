import type { Application } from '@candydati/domain';
import type { AutomationExecution } from '../../automation-ports.js';

/** The rule already acted for this occurrence of its trigger in the application's current entry into `stageId`. */
export const alreadyRan = (runs: readonly AutomationExecution[], application: Pick<Application, 'id' | 'stageChangedAt'>, stageId: string, occurrence: string): boolean =>
  runs.some(
    (run) =>
      run.applicationId === application.id &&
      run.stageId === stageId &&
      run.stageEnteredAt.getTime() === application.stageChangedAt.getTime() &&
      run.occurrence === occurrence,
  );
