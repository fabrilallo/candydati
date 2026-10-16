import {
  BULK_MESSAGE_MAX,
  EMAIL_TEMPLATE_BODY_MAX,
  EMAIL_TEMPLATE_SUBJECT_MAX,
  renderTemplate,
  type Job,
  type Message,
} from '@candydati/domain';
import { z } from 'zod';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import type { TaskQueue } from '../../intake-ports.js';
import type { MessageRepository, MessagingDeps } from '../../messaging-ports.js';
import { baseDeps, inTransaction, queuesInTransaction, type TransactionalDeps } from '../../transaction.js';
import { requireJob } from '../jobs/shared.js';
import { requireCandidate } from '../candidates/shared.js';
import { defineMessagingUseCase } from './define.js';
import { assertKnownVariables } from './email-templates.js';
import { buildTemplateValues, DEFAULT_TEMPLATE_PREFIX, ensureConversation, oneLine, requireOrganization } from './shared.js';
import type { SendMessageResult } from './views.js';
import { mapSequential } from '../../sequential.js';

const QUEUE_FAILED = 'queue_unavailable';

async function enqueueNow(queue: TaskQueue, messages: MessageRepository, message: Message): Promise<boolean> {
  try {
    await queue.enqueue('email.send', { organizationId: message.organizationId, messageId: message.id }, { singletonKey: message.id });
    return true;
  } catch {
    await messages.transition(message.organizationId, message.id, 'queued', { status: 'failed', error: QUEUE_FAILED });
    return false;
  }
}

/**
 * Queues the delivery of a stored message, once per message. When the task cannot be queued the message is stored as
 * `failed`, so it never stays `queued` forever. Inside a transaction that owns the queue (pg-boss on its connection)
 * the task is inserted with the message. With any other queue it is sent after the commit (the worker must find the
 * row), and the answer is optimistic: a failure then shows on the message itself.
 */
export async function enqueueDelivery(deps: Pick<MessagingDeps, 'queue' | 'messages'> & Partial<TransactionalDeps>, message: Message): Promise<boolean> {
  if (queuesInTransaction(deps)) {
    // The task commits with the message, or neither does: a failure here fails the transaction.
    await deps.queue.enqueue('email.send', { organizationId: message.organizationId, messageId: message.id }, { singletonKey: message.id });
    return true;
  }
  if (!deps.afterCommit) return enqueueNow(deps.queue, deps.messages, message);
  const base = baseDeps(deps);
  deps.afterCommit(async () => void (await enqueueNow(base.queue, base.messages, message)));
  return true;
}

/** Recipients stored per transaction in a bulk send. */
export const SEND_CHUNK = 50;

/**
 * One chunk in ONE transaction: conversations, messages and (with a queue the transaction owns) their tasks. With any
 * other queue the tasks are sent once the chunk committed, so the counts say which ones failed.
 */
async function storeChunk(deps: MessagingDeps, drafts: readonly Message[]): Promise<readonly boolean[]> {
  let owned = false;
  const stored = await inTransaction(deps, async (tx) => {
    owned = queuesInTransaction(tx);
    const messages: Message[] = [];
    for (const draft of drafts) {
      await ensureConversation(tx, draft.organizationId, draft.applicationId);
      const message = await tx.messages.create(draft);
      if (owned) await enqueueDelivery(tx, message);
      messages.push(message);
    }
    return messages;
  });
  return owned ? stored.map(() => true) : mapSequential(stored, (message) => enqueueDelivery(deps, message));
}

async function assertTemplateExists(deps: MessagingDeps, organizationId: string, templateId: string): Promise<void> {
  if (templateId.startsWith(DEFAULT_TEMPLATE_PREFIX)) return;
  if (!(await deps.templates.findById(organizationId, templateId))) throw new NotFoundError('Template not found.');
}

/**
 * Sends one email to each of the applications (bulk = many ids). Everything is validated and rendered before anything
 * is stored; then one `queued` message and one `email.send` task per recipient, SEND_CHUNK recipients per transaction. Always a person's decision: the agent
 * never sends (PRODUCT.md §5). Closed applications can receive messages: outcome messages go out after deciding.
 */
export const sendMessage = defineMessagingUseCase({
  name: 'sendMessage',
  input: z.object({
    applicationIds: z.array(z.string().min(1)).min(1).max(BULK_MESSAGE_MAX),
    templateId: z.string().min(1).optional(),
    subject: z.string().trim().min(1).max(EMAIL_TEMPLATE_SUBJECT_MAX),
    body: z.string().trim().min(1).max(EMAIL_TEMPLATE_BODY_MAX),
  }),
  permission: 'message:send',
  audit: { skip: 'each message is audited by deliverMessage (message.sent / message.failed) with the user in `sentBy`' },
  transaction: { skip: 'one transaction per chunk of SEND_CHUNK recipients (storeChunk), not one for the whole bulk' },
  handler: async ({ deps, actor, input }): Promise<SendMessageResult> => {
    if (actor.type === 'agent') throw new ForbiddenError('The agent never sends messages to candidates.');
    const { organizationId } = actor;
    assertKnownVariables(input.subject, input.body);
    if (input.templateId !== undefined) await assertTemplateExists(deps, organizationId, input.templateId);
    const organization = await requireOrganization(deps, organizationId);
    const sentBy = actor.onBehalfOfUserId ?? actor.id ?? 'system';
    const now = deps.now();
    const jobs = new Map<string, Promise<Job>>();
    const drafts = await mapSequential(
      [...new Set(input.applicationIds)],
      async (applicationId): Promise<Message> => {
        const application = await deps.applications.findById(organizationId, applicationId);
        if (!application) throw new NotFoundError('Application not found.');
        const candidate = await requireCandidate(deps, organizationId, application.candidateId);
        // A bulk send usually goes to one job: read it once.
        const job = await (jobs.get(application.jobId) ?? jobs.set(application.jobId, requireJob(deps, organizationId, application.jobId)).get(application.jobId)!);
        const values = buildTemplateValues({ config: deps.config, organization, job, candidate, stageId: application.stageId });
        const subject = oneLine(renderTemplate(input.subject, values).text);
        if (subject === '') throw new ValidationError([{ path: 'subject', message: 'subject_empty' }]);
        return {
          id: deps.newId(),
          organizationId,
          applicationId,
          candidateId: candidate.id,
          direction: 'outbound',
          subject,
          bodyText: renderTemplate(input.body, values).text,
          status: 'queued',
          providerMessageId: null,
          sentBy,
          createdAt: now,
          sentAt: null,
          error: null,
          rawText: null,
          unverifiedSender: false,
          inboundMessageId: null,
          historical: false,
        };
      },
    );
    const results: boolean[] = [];
    for (let start = 0; start < drafts.length; start += SEND_CHUNK) results.push(...(await storeChunk(deps, drafts.slice(start, start + SEND_CHUNK))));
    const queued = results.filter(Boolean).length;
    return { queued, failed: results.length - queued };
  },
});
