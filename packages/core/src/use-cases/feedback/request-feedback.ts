import { interviewerInputSchema } from '@tt/domain';
import { z } from 'zod';
import { toAuditActor } from '../../actor.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { requireApplication } from '../candidates/shared.js';
import { defineFeedbackUseCase } from './define.js';
import { loadRequestContext } from './request-on-stage-entry.js';
import { issueRequest, resolveTargets, toRequestView, type FeedbackRequestView, type FeedbackTarget } from './shared.js';

/**
 * The recruiter asks for feedback by hand: for the configured interviewers of a stage (default: the current one), or for
 * one more person given in `interviewer`. Always makes fresh requests, even when one is open, because the point is to
 * send a new link.
 */
export const requestFeedback = defineFeedbackUseCase({
  name: 'requestFeedback',
  input: z.object({
    applicationId: z.string().min(1),
    stageId: z.string().min(1).optional(),
    interviewer: interviewerInputSchema.optional(),
  }),
  permission: 'feedback:manage',
  audit: { skip: 'every request is audited as feedback.requested inside, one event per interviewer' },
  handler: async ({ deps, actor, input }): Promise<readonly FeedbackRequestView[]> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    const stageId = input.stageId ?? application.stageId;
    const context = await loadRequestContext(deps, actor.organizationId, application.id, stageId);
    if (!context) throw new NotFoundError('Application not found.');
    if (context.stage.declared === null) throw new ValidationError([{ path: 'stageId', message: 'unknown_stage' }]);
    const targets: readonly FeedbackTarget[] = input.interviewer
      ? await resolveTargets(deps, actor.organizationId, [{ kind: input.interviewer.kind, userId: input.interviewer.userId ?? null, email: input.interviewer.email ?? null, name: input.interviewer.name ?? '' }])
      : await resolveTargets(deps, actor.organizationId, await deps.stageInterviewers.listByStage(actor.organizationId, context.job.id, stageId));
    if (targets.length === 0) throw new ValidationError([{ path: input.interviewer ? 'interviewer' : 'stageId', message: 'no_interviewers' }]);
    const by = { requestedBy: actor.onBehalfOfUserId ?? actor.id ?? 'system', actor: toAuditActor(actor) };
    const created = [];
    for (const target of targets) created.push(await issueRequest(deps, context, target, by));
    const now = deps.now();
    return created.map((request) => toRequestView(request, context.job, now));
  },
});
