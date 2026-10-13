import {
  buildFeedbackEmail,
  feedbackPath,
  feedbackRequestStatus,
  FEEDBACK_TOKEN_TTL_DAYS,
  pipelineStagesOf,
  textToHtml,
  DAY_MS,
  type Application,
  type AuditActor,
  type Candidate,
  type FeedbackRequest,
  type FeedbackRequestStatus,
  type InterviewerKind,
  type Job,
  type SelectionStage,
  type StageInterviewer,
} from '@tt/domain';
import type { FeedbackMailParts, FeedbackStageEntryDeps } from '../../feedback-ports.js';
import type { PublicOrganization } from '../../job-ports.js';
import { formatFrom, senderIdentity, stageName } from '../messaging/shared.js';

export const FEEDBACK_PAGE_ACTOR_ID = 'feedback_page';
export const FEEDBACK_SCAN_ACTOR_ID = 'feedback_scan';
export const FEEDBACK_PAGE_ACTOR: AuditActor = { type: 'system', id: FEEDBACK_PAGE_ACTOR_ID, onBehalfOfUserId: null };
export const FEEDBACK_SCAN_ACTOR: AuditActor = { type: 'system', id: FEEDBACK_SCAN_ACTOR_ID, onBehalfOfUserId: null };

/** One person to ask: a member resolved to their current email, or an external person. */
export interface FeedbackTarget {
  readonly kind: InterviewerKind;
  readonly userId: string | null;
  /** Lowercase. */
  readonly email: string;
  readonly name: string;
}

export const identityOf = (target: { readonly userId: string | null; readonly email: string }): string =>
  target.userId ?? target.email.toLowerCase();

export const requestIdentity = (request: FeedbackRequest): string => identityOf({ userId: request.interviewerUserId, email: request.interviewerEmail });

export interface StageContext {
  readonly stageId: string;
  /** Null when the stage is `received` or was removed from the job. */
  readonly declared: SelectionStage | null;
  readonly label: string;
}

export function stageContextOf(job: Job, stageId: string): StageContext {
  const declared = pipelineStagesOf(job.content.process).find((stage) => stage.id === stageId)?.declared ?? null;
  return { stageId, declared, label: stageName(job, stageId) };
}

/** Members resolve to their current address; a member who left, or an interviewer without an address, is skipped. */
export async function resolveTargets(
  deps: Pick<FeedbackStageEntryDeps, 'members'>,
  organizationId: string,
  interviewers: readonly Pick<StageInterviewer, 'kind' | 'userId' | 'email' | 'name'>[],
): Promise<readonly FeedbackTarget[]> {
  const members = await deps.members.list(organizationId);
  const targets: FeedbackTarget[] = [];
  for (const interviewer of interviewers) {
    if (interviewer.kind === 'member') {
      const member = members.find((candidate) => candidate.userId === interviewer.userId);
      if (member) targets.push({ kind: 'member', userId: member.userId, email: member.email.toLowerCase(), name: member.name });
    } else if (interviewer.email) {
      targets.push({ kind: 'external', userId: null, email: interviewer.email.toLowerCase(), name: interviewer.name });
    }
  }
  return targets;
}

export interface RequestContext {
  readonly organization: PublicOrganization;
  readonly job: Job;
  readonly application: Application;
  readonly candidate: Candidate;
  readonly stage: StageContext;
}

/** Sends the link. Never throws: a failed email is reported through `onError` and the request stays. */
export async function sendRequestEmail(
  deps: FeedbackMailParts,
  context: RequestContext,
  request: Pick<FeedbackRequest, 'interviewerEmail' | 'interviewerName' | 'expiresAt'>,
  secret: string,
  reminder: boolean,
): Promise<boolean> {
  try {
    const identity = senderIdentity(deps.config, context.organization, null);
    const mail = buildFeedbackEmail({
      locale: context.job.content.language,
      interviewerName: request.interviewerName,
      candidateName: `${context.candidate.firstName} ${context.candidate.lastName}`,
      jobTitle: context.job.content.title,
      stageLabel: context.stage.label,
      organizationName: context.organization.name,
      link: `${deps.config.platformUrl.replace(/\/$/, '')}${feedbackPath(secret)}`,
      expiresAt: request.expiresAt,
      reminder,
    });
    await deps.sender.send({
      from: formatFrom(identity),
      replyTo: identity.address,
      to: request.interviewerEmail,
      subject: mail.subject.replace(/\s+/g, ' ').trim(),
      text: mail.text,
      html: textToHtml(mail.text),
      headers: { 'Auto-Submitted': 'auto-generated' },
    });
    return true;
  } catch (error) {
    deps.onError?.(error);
    return false;
  }
}

/** Creates the request with a fresh secret, audits it and sends the link. The audit event carries ids only. */
export async function issueRequest(
  deps: FeedbackStageEntryDeps,
  context: RequestContext,
  target: FeedbackTarget,
  by: { readonly requestedBy: string; readonly actor: AuditActor },
): Promise<FeedbackRequest> {
  const secret = deps.newToken();
  const now = deps.now();
  const request = await deps.feedbackRequests.create({
    id: deps.newId(),
    organizationId: context.application.organizationId,
    applicationId: context.application.id,
    jobId: context.job.id,
    stageId: context.stage.stageId,
    interviewerKind: target.kind,
    interviewerUserId: target.userId,
    interviewerEmail: target.email,
    interviewerName: target.name,
    tokenHash: deps.hash(secret),
    expiresAt: new Date(now.getTime() + FEEDBACK_TOKEN_TTL_DAYS * DAY_MS),
    remindersSent: 0,
    lastReminderAt: null,
    requestedBy: by.requestedBy,
    createdAt: now,
    submittedAt: null,
  });
  await deps.auditLog.append({
    organizationId: request.organizationId,
    actor: by.actor,
    action: 'feedback.requested',
    target: { type: 'feedback_request', id: request.id },
    metadata: { applicationId: request.applicationId, stageId: request.stageId, interviewerKind: request.interviewerKind },
  });
  await sendRequestEmail(deps, context, request, secret, false);
  return request;
}

/** What a recruiter sees of a request: never the link, never the hash. */
export interface FeedbackRequestView {
  readonly id: string;
  readonly applicationId: string;
  readonly stageId: string;
  readonly stageLabel: string;
  readonly interviewerKind: InterviewerKind;
  readonly interviewerName: string;
  readonly status: FeedbackRequestStatus;
  readonly remindersSent: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly submittedAt: Date | null;
}

export const toRequestView = (request: FeedbackRequest, job: Job, now: Date): FeedbackRequestView => ({
  id: request.id,
  applicationId: request.applicationId,
  stageId: request.stageId,
  stageLabel: stageName(job, request.stageId),
  interviewerKind: request.interviewerKind,
  interviewerName: request.interviewerName,
  status: feedbackRequestStatus(request, now),
  remindersSent: request.remindersSent,
  createdAt: request.createdAt,
  expiresAt: request.expiresAt,
  submittedAt: request.submittedAt,
});
