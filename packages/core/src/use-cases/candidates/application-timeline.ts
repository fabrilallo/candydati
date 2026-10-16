import { z } from 'zod';
import { can } from '../../authorization.js';
import type { CandidateDeps } from '../../candidate-ports.js';
import { NotFoundError } from '../../errors.js';
import type { FeedbackRecords } from '../../feedback-ports.js';
import { sequential } from '../../sequential.js';
import { defineUseCase } from '../../use-case.js';
import { isVisibleApplication, requireApplication } from './shared.js';
import { chronological, consentItems, feedbackItems, isIntake, messageItems, noteItems, receivedItem, stageItems } from './timeline-items.js';
import type { ApplicationTimelineView, TimelineItemView } from './views.js';

/** What the timeline composes: the repositories the sheet already reads, scoped to the actor's jobs by the use case runner. */
export type TimelineDeps = Pick<CandidateDeps, 'auditLog' | 'transaction' | 'jobTeams' | 'applications' | 'notes' | 'messages' | 'stageEvents' | 'users'> &
  Pick<FeedbackRecords, 'interviewFeedback'>;

const none: readonly TimelineItemView[] = [];

/**
 * The story of one application, oldest first: received, stage moves, notes, messages, feedback submitted, consent and
 * outcome. Same access as the sheet: the application must be in the actor's jobs (else it does not exist), messages and
 * feedback appear only to who may read them, and nothing is scored. Shown inside the profile, whose opening is audited.
 */
export const getApplicationTimeline = defineUseCase<TimelineDeps, z.ZodObject<{ applicationId: z.ZodString; viaJobId: z.ZodOptional<z.ZodString> }>, ApplicationTimelineView>({
  name: 'getApplicationTimeline',
  input: z.object({ applicationId: z.string().min(1), viaJobId: z.string().min(1).optional() }),
  permission: 'candidate:read',
  audit: { skip: 'shown inside the candidate profile, whose opening is audited as candidate.viewed' },
  handler: async ({ deps, actor, input }): Promise<ApplicationTimelineView> => {
    const { organizationId } = actor;
    const application = await requireApplication(deps, organizationId, input.applicationId);
    if (!isVisibleApplication(application, input.viaJobId)) throw new NotFoundError('Application not found.');
    const [events, notes, messages, feedback] = await sequential(
      () => deps.stageEvents.listByApplication(organizationId, application.id),
      () => deps.notes.listByCandidate(organizationId, application.candidateId),
      () => (can(actor, 'message:read') ? deps.messages.listByApplication(organizationId, application.id) : Promise.resolve([] as never[])),
      () => (can(actor, 'feedback:read') ? deps.interviewFeedback.listByApplication(organizationId, application.id) : Promise.resolve([] as never[])),
    );
    const ids = [...new Set([...notes.flatMap((n) => (n.authorId === null ? [] : [n.authorId])), ...messages.flatMap((m) => (m.sentBy === null ? [] : [m.sentBy]))])];
    const names = await deps.users.namesOf(organizationId, ids);
    const intake = events.find(isIntake);
    return {
      items: chronological([
        receivedItem(application, intake),
        ...consentItems(application),
        ...stageItems(events, application),
        ...noteItems(notes, application.id, names),
        ...(messages.length > 0 ? messageItems(messages, names) : none),
        ...feedbackItems(feedback),
      ]),
    };
  },
});
