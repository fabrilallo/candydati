import { type AuditActor } from '@tt/domain';
import type { FeedbackStageEntryDeps } from '../../feedback-ports.js';
import {
  identityOf,
  issueRequest,
  requestIdentity,
  resolveTargets,
  stageContextOf,
  type FeedbackTarget,
  type RequestContext,
} from './shared.js';
import { sequential } from '../../sequential.js';

export interface StageEntry {
  readonly organizationId: string;
  readonly applicationId: string;
  readonly stageId: string;
  /** Who moved the application (or the system actor of the intake). */
  readonly actor: AuditActor;
  /** Recorded as `requestedBy`: the person, never an agent or key. */
  readonly requestedBy: string;
}

/** Loads what a request needs; null when something is gone or the application is not visible (consent to renew). */
export async function loadRequestContext(
  deps: FeedbackStageEntryDeps,
  organizationId: string,
  applicationId: string,
  stageId: string,
): Promise<RequestContext | null> {
  const application = await deps.applications.findById(organizationId, applicationId);
  if (!application || application.consentStatus !== 'given') return null;
  const [job, candidate, organization] = await sequential(
    () => deps.jobs.findById(organizationId, application.jobId),
    () => deps.candidates.findById(organizationId, application.candidateId),
    () => deps.organizations.findById(organizationId),
  );
  if (!job || !candidate || !organization) return null;
  return { organization, job, application, candidate, stage: stageContextOf(job, stageId) };
}

/** Targets that have nothing open or submitted for this application and stage yet. */
async function missingTargets(deps: FeedbackStageEntryDeps, context: RequestContext, targets: readonly FeedbackTarget[]): Promise<readonly FeedbackTarget[]> {
  const now = deps.now();
  const existing = await deps.feedbackRequests.listByApplication(context.application.organizationId, context.application.id);
  const taken = new Set(
    existing.filter((request) => request.stageId === context.stage.stageId && (request.submittedAt !== null || request.expiresAt > now)).map(requestIdentity),
  );
  return targets.filter((target) => !taken.has(identityOf(target)));
}

/**
 * Called after the change that brought the application into a stage has committed (move, intake). Asks each interviewer
 * configured for the stage who has not been asked yet; coming back to a stage never asks twice. A failure is reported
 * through `onError` and never undoes the move: the recruiter can ask again by hand. Returns how many requests were made.
 */
export async function requestFeedbackOnStageEntry(deps: FeedbackStageEntryDeps, entry: StageEntry): Promise<number> {
  try {
    const context = await loadRequestContext(deps, entry.organizationId, entry.applicationId, entry.stageId);
    if (!context) return 0;
    const configured = await deps.stageInterviewers.listByStage(entry.organizationId, context.job.id, entry.stageId);
    if (configured.length === 0) return 0;
    const wanted = await missingTargets(deps, context, await resolveTargets(deps, entry.organizationId, configured));
    for (const target of wanted) await issueRequest(deps, context, target, { requestedBy: entry.requestedBy, actor: entry.actor });
    return wanted.length;
  } catch (error) {
    deps.onError?.(error);
    return 0;
  }
}
