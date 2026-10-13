import { statusWhenAnswered, type ActorType, type Application, type Outcome } from '@tt/domain';
import type { ResponsePromiseRepository, TrackingDeps } from '../../report-ports.js';

/**
 * The history behind the reports: stage events and response promises. This is the only place that writes them; the use
 * cases that already maintain `responseDueAt` / `respondedAt` call it right after saving the application, and the
 * promise takes its deadline from the application (`responseDueAt`), so the clock is computed once, in the domain.
 */

/** A person answered: the unanswered promise of the application closes, kept when on time and missed when late. */
export async function answerPromise(promises: ResponsePromiseRepository, organizationId: string, applicationId: string, at: Date): Promise<void> {
  const open = await promises.findUnanswered(organizationId, applicationId);
  if (!open) return;
  await promises.save({ ...open, respondedAt: at, status: statusWhenAnswered(open.dueAt, at) });
}

/**
 * The application entered `application.stageId` (just saved: `stageChangedAt` is the entry time). Moving on answers the
 * previous promise; a job that declares a response time opens the next one.
 */
export async function trackStageEntry(
  deps: TrackingDeps,
  application: Application,
  fromStageId: string | null,
  actorType: ActorType,
): Promise<void> {
  const { organizationId } = application;
  const at = application.stageChangedAt;
  if (fromStageId !== null) await answerPromise(deps.promises, organizationId, application.id, at);
  await deps.stageEvents.record({
    id: deps.newId(),
    organizationId,
    applicationId: application.id,
    jobId: application.jobId,
    fromStageId,
    toStageId: application.stageId,
    outcome: null,
    occurredAt: at,
    actorType,
    backfilled: false,
  });
  if (application.responseDueAt === null) return;
  await deps.promises.create({
    id: deps.newId(),
    organizationId,
    applicationId: application.id,
    jobId: application.jobId,
    stageId: application.stageId,
    startedAt: at,
    dueAt: application.responseDueAt,
    respondedAt: null,
    status: 'open',
    backfilled: false,
  });
}

/** The application was decided (just saved: `closedAt` is the decision time): the promise closes and the decision is recorded. */
export async function trackDecision(deps: TrackingDeps, application: Application, outcome: Outcome, actorType: ActorType): Promise<void> {
  const { organizationId } = application;
  const at = application.closedAt ?? application.updatedAt;
  await answerPromise(deps.promises, organizationId, application.id, at);
  await deps.stageEvents.record({
    id: deps.newId(),
    organizationId,
    applicationId: application.id,
    jobId: application.jobId,
    fromStageId: application.stageId,
    toStageId: null,
    outcome,
    occurredAt: at,
    actorType,
    backfilled: false,
  });
}
