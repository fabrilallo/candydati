import { SYSTEM_SENDER, textToHtml, type Candidate, type Message } from '@tt/domain';
import { z } from 'zod';
import { toAuditActor, type Actor } from '../../actor.js';
import { ConflictError } from '../../errors.js';
import type { PublicOrganization } from '../../job-ports.js';
import type { DeliverDeps } from '../../messaging-ports.js';
import { inTransaction } from '../../transaction.js';
import { answerPromise } from '../reports/tracking.js';
import { defineUseCase } from '../../use-case.js';
import { ensureConversation, formatFrom, replyToAddress, senderIdentity } from './shared.js';
import type { DeliverResult } from './views.js';
import { sequential } from '../../sequential.js';

export const DELIVERY_FAILED = 'delivery_failed';
export const DELIVERY_REJECTED = 'delivery_rejected';
export const RECIPIENT_MISSING = 'recipient_missing';
/** Claimed by an attempt that never recorded its outcome, and the provider cannot drop a repeated send. */
export const DELIVERY_UNCONFIRMED = 'delivery_unconfirmed';

const inputSchema = z.object({
  organizationId: z.string().min(1),
  messageId: z.string().min(1),
  /** The worker passes false while retries remain: a transient error is then rethrown instead of marking `failed`. */
  lastAttempt: z.boolean().default(true),
  /** 1-based, from the queue's retry count. Only a retry may find its own earlier claim unfinished. */
  attempt: z.number().int().min(1).default(1),
});

/**
 * A person's message that went out after the last stage change keeps the promise to answer: `respondedAt` is set and the
 * deadline cleared until the next move. The automatic receipt (`system`) and a message written in an earlier stage do not.
 * Guarded on the stage it was read in: a move or decision that got there first is left alone.
 */
async function markResponded(deps: DeliverDeps, message: Message, sentAt: Date): Promise<void> {
  if (message.sentBy === null || message.sentBy === SYSTEM_SENDER) return;
  const application = await deps.applications.findById(message.organizationId, message.applicationId);
  if (!application || application.outcome !== null || application.respondedAt !== null) return;
  if (message.createdAt < application.stageChangedAt) return;
  try {
    await deps.applications.transition(application.organizationId, application.id, { stageId: application.stageId }, { respondedAt: sentAt, responseDueAt: null });
  } catch (error) {
    if (error instanceof ConflictError) return;
    throw error;
  }
  await answerPromise(deps.promises, application.organizationId, application.id, sentAt);
}

const isPermanent = (error: unknown): boolean => (error as { permanent?: unknown } | null)?.permanent === true;

type Outcome = Pick<Message, 'status' | 'error'> & Partial<Pick<Message, 'sentAt' | 'providerMessageId'>>;

/** One transaction: the claimed message gets its final state, its audit event and (when sent) the answered promise. */
async function recordOutcome(deps: DeliverDeps, actor: Actor, message: Message, outcome: Outcome): Promise<void> {
  await inTransaction(deps, async (tx) => {
    const done = await tx.messages.transition(message.organizationId, message.id, 'sending', outcome);
    if (!done) return;
    await tx.auditLog.append({
      organizationId: message.organizationId,
      actor: toAuditActor(actor),
      action: done.status === 'sent' ? 'message.sent' : 'message.failed',
      target: { type: 'message', id: message.id },
      metadata: { applicationId: message.applicationId, sentBy: message.sentBy ?? SYSTEM_SENDER, ...(done.error ? { error: done.error } : {}) },
    });
    if (done.status === 'sent' && done.sentAt) await markResponded(tx, message, done.sentAt);
  });
}

/**
 * The message this delivery may send, or null. `queued → sending` is the claim: of two deliveries of the same message only
 * one gets it, the other skips. On a retry (attempt > 1) a message still `sending` was claimed by the earlier attempt,
 * which never recorded its outcome (a crash, a failed write after the provider accepted it): it is sent again only when
 * the provider drops repeated idempotency keys, otherwise it is recorded as failed and never sent twice.
 */
async function claim(deps: DeliverDeps, actor: Actor, message: Message, attempt: number): Promise<Message | null> {
  if (message.status === 'queued') return deps.messages.transition(message.organizationId, message.id, 'queued', { status: 'sending' });
  if (message.status !== 'sending' || attempt === 1) return null;
  if (deps.sender.deduplicates === true) return message;
  await recordOutcome(deps, actor, message, { status: 'failed', error: DELIVERY_UNCONFIRMED });
  return null;
}

async function send(deps: DeliverDeps, message: Message, candidate: Candidate, organization: PublicOrganization): Promise<string> {
  const settings = await deps.settings.find(message.organizationId);
  const conversation = await ensureConversation(deps, message.organizationId, message.applicationId);
  const { providerMessageId } = await deps.sender.send({
    from: formatFrom(senderIdentity(deps.config, organization, settings)),
    replyTo: replyToAddress(deps.config, conversation),
    to: candidate.email,
    subject: message.subject,
    text: message.bodyText,
    html: textToHtml(message.bodyText, { literals: [candidate.firstName, candidate.lastName] }),
    headers: message.sentBy === SYSTEM_SENDER ? { 'Auto-Submitted': 'auto-generated' } : {},
    idempotencyKey: message.id,
  });
  return providerMessageId;
}

/**
 * Worker use case (system actor, task `email.send`). Claims the message before sending (see `claim`), so a repeated
 * task never sends it twice. Transient send errors put the claim back and are rethrown while retries remain; the stored
 * error is a short code, never the provider's text.
 */
export const deliverMessage = defineUseCase<DeliverDeps, typeof inputSchema, DeliverResult>({
  name: 'deliverMessage',
  input: inputSchema,
  organizationOf: (input) => input.organizationId,
  permission: { skip: 'system job enqueued by sendMessage and submitApplication; the organization scope still applies' },
  audit: { skip: 'recorded in the handler, only when the message really changes state' },
  transaction: { skip: 'claim, send and outcome are three steps: the email cannot be inside a transaction' },
  handler: async ({ deps, actor, input }): Promise<DeliverResult> => {
    const { organizationId } = input;
    const found = await deps.messages.findById(organizationId, input.messageId);
    if (!found || found.direction !== 'outbound') return 'skipped';
    const message = await claim(deps, actor, found, input.attempt);
    if (!message) return found.status === 'sending' && input.attempt > 1 ? 'failed' : 'skipped';
    const [candidate, organization] = await sequential(() => deps.candidates.findById(organizationId, message.candidateId), () => deps.organizations.findById(organizationId));
    if (!candidate || !organization) {
      await recordOutcome(deps, actor, message, { status: 'failed', error: RECIPIENT_MISSING });
      return 'failed';
    }
    let providerMessageId: string;
    try {
      providerMessageId = await send(deps, message, candidate, organization);
    } catch (error) {
      const permanent = isPermanent(error);
      if (!permanent && !input.lastAttempt) {
        await deps.messages.transition(organizationId, message.id, 'sending', { status: 'queued' });
        throw error;
      }
      await recordOutcome(deps, actor, message, { status: 'failed', error: permanent ? DELIVERY_REJECTED : DELIVERY_FAILED });
      return 'failed';
    }
    await recordOutcome(deps, actor, message, { status: 'sent', sentAt: deps.now(), providerMessageId, error: null });
    return 'sent';
  },
});
