import { JOB_OWNER_ASSIGNEE, type Application, type Job, type MoveProposal, type NotificationKind } from '@candydati/domain';
import type { CoreDeps } from '../../ports.js';
import type { MemberDirectory, NotificationRepository } from '../../automation-ports.js';
import { reachingRole } from './action-context.js';

type Payload = Readonly<Record<string, string | number | boolean | null>>;

export interface RecipientDeps extends Pick<CoreDeps, 'jobTeams'> {
  readonly members: MemberDirectory;
}

export interface NoticeDeps extends RecipientDeps {
  readonly notifications: NotificationRepository;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** Of these people (or `job_owner`), the members who can open the job today: nobody hears about a job they cannot open. */
export async function reachablePeople(deps: RecipientDeps, organizationId: string, job: Pick<Job, 'id' | 'createdBy'>, people: readonly string[]): Promise<readonly string[]> {
  const ids = [...new Set(people.map((person) => (person === JOB_OWNER_ASSIGNEE ? job.createdBy : person)))];
  const members = await deps.members.list(organizationId);
  const kept: string[] = [];
  for (const id of ids) {
    const member = members.find((m) => m.userId === id);
    if (member && (await reachingRole(deps, organizationId, member, job.id)) !== null) kept.push(id);
  }
  return kept;
}

/** One in-app notification per person, once per `key` (a repeated call writes nothing). */
export async function notifyPeople(
  deps: Pick<NoticeDeps, 'notifications' | 'newId' | 'now'>,
  target: { readonly organizationId: string; readonly applicationId: string; readonly jobId: string },
  userIds: readonly string[],
  kind: NotificationKind,
  payload: Payload,
  key: string,
): Promise<void> {
  for (const userId of userIds) {
    await deps.notifications.createIfAbsent(
      { id: deps.newId(), ...target, userId, kind, taskId: null, payload, createdAt: deps.now(), readAt: null },
      key,
    );
  }
}

/**
 * Tells the job owner that someone other than themselves (a person, the assistant, a key or a connected app) proposed a
 * move. Ids and the source only: the reason is free text kept with the proposal, which each reader gets through the
 * stage-read rule of the proposals list, never copied into a notification.
 */
export async function notifyProposedMove(deps: NoticeDeps, job: Job, application: Application, proposal: MoveProposal): Promise<void> {
  const recipients = (await reachablePeople(deps, proposal.organizationId, job, [JOB_OWNER_ASSIGNEE])).filter((id) => id !== proposal.proposedBy);
  await notifyPeople(
    deps,
    { organizationId: proposal.organizationId, applicationId: application.id, jobId: job.id },
    recipients,
    'move_proposed',
    { proposalId: proposal.id, toStageId: proposal.toStageId, source: proposal.source },
    `move_proposed:${proposal.id}`,
  );
}
