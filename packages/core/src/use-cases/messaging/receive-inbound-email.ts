import {
  CONVERSATION_TOKEN_PATTERN,
  htmlToText,
  MESSAGE_BODY_MAX,
  RAW_TEXT_MAX,
  type Message,
} from '@tt/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import type { InboundDeps } from '../../messaging-ports.js';
import { inSavepoint } from '../../transaction.js';
import { definePublicCommand } from '../../use-case.js';
import type { InboundResult } from './views.js';

export const INBOUND_ACTOR_ID = 'inbound_email';
const SUBJECT_MAX = 500;
const TOKEN_IN_ADDRESS = /reply\+([a-z2-7]{24,64})@/i;

/** What the provider adapters hand over, already parsed. `rawText` is the unstripped original when `text` was stripped. */
export const inboundEmailSchema = z.object({
  to: z.array(z.string().max(500)).min(1).max(100),
  from: z.string().min(1).max(1000),
  subject: z.string().max(5000).default(''),
  text: z.string().max(5_000_000).default(''),
  html: z.string().max(10_000_000).optional(),
  rawText: z.string().max(5_000_000).optional(),
  messageId: z.string().trim().min(1).max(998),
  inReplyTo: z.string().max(998).optional(),
  receivedAt: z.date(),
});
export type InboundEmail = z.input<typeof inboundEmailSchema>;

const clean = (value: string): string => value.replaceAll('\u0000', '').replaceAll('\r\n', '\n').trim();

/** `Ada <ADA@x.it>` and `ada@x.it` both give `ada@x.it`. */
export function addressOf(from: string): string {
  const angle = /<([^<>]+)>\s*$/.exec(from);
  return (angle?.[1] ?? from).trim().toLowerCase();
}

const tokensIn = (to: readonly string[]): readonly string[] =>
  to.flatMap((address) => {
    const token = TOKEN_IN_ADDRESS.exec(address)?.[1]?.toLowerCase();
    return token !== undefined && CONVERSATION_TOKEN_PATTERN.test(token) ? [token] : [];
  });

async function findConversation(deps: InboundDeps, to: readonly string[]) {
  for (const token of tokensIn(to)) {
    const found = await deps.conversations.findByToken(token);
    if (found) return found;
  }
  return null;
}

function bodies(input: z.output<typeof inboundEmailSchema>): { readonly bodyText: string; readonly rawText: string } {
  const primary = clean(input.text) || (input.html ? htmlToText(clean(input.html)) : '');
  const original = clean(input.rawText ?? '') || primary;
  return { bodyText: primary.slice(0, MESSAGE_BODY_MAX), rawText: original.slice(0, RAW_TEXT_MAX) };
}

/** What was stored, for the audit event only: callers get the `InboundResult` without it. */
interface InboundOutcome extends InboundResult {
  readonly message?: Pick<Message, 'id' | 'organizationId' | 'applicationId' | 'unverifiedSender'>;
}

function toMessage(deps: InboundDeps, input: z.output<typeof inboundEmailSchema>, organizationId: string, applicationId: string, candidate: { readonly id: string; readonly email: string }): Message {
  const now = deps.now();
  const { bodyText, rawText } = bodies(input);
  return {
    id: deps.newId(),
    organizationId,
    applicationId,
    candidateId: candidate.id,
    direction: 'inbound',
    subject: clean(input.subject).replace(/\s+/g, ' ').slice(0, SUBJECT_MAX),
    bodyText,
    status: 'received',
    providerMessageId: null,
    sentBy: null,
    // Ordered by when we received it: the Date header is the sender's claim and can be skewed or forged.
    createdAt: now,
    sentAt: input.receivedAt > now ? now : input.receivedAt,
    error: null,
    rawText,
    unverifiedSender: addressOf(input.from) !== candidate.email.toLowerCase(),
    inboundMessageId: input.messageId,
  };
}

/**
 * Public, no session (provider webhook; the signature is checked by the adapter). The token in the reply address finds
 * the conversation; an unknown token is dropped. A sender other than the candidate is stored flagged `unverifiedSender`,
 * never trusted. Dedupe by `Message-ID`. The body is stored as text and never rendered as HTML. The message and
 * `message.received` commit together: if the audit fails nothing is stored, so the provider's retry is not a duplicate.
 */
const storeInboundEmail = definePublicCommand<InboundDeps, typeof inboundEmailSchema, InboundOutcome>({
  name: 'receiveInboundEmail',
  input: inboundEmailSchema,
  actorId: INBOUND_ACTOR_ID,
  audit: {
    action: (_input, result) => (result.message ? 'message.received' : null),
    organizationOf: (_input, result) => result.message?.organizationId ?? '',
    target: (_input, result) => ({ type: 'message', id: result.message?.id ?? '' }),
    metadata: (_input, result) => ({ applicationId: result.message?.applicationId, unverifiedSender: result.message?.unverifiedSender }),
  },
  handler: async ({ deps, input }): Promise<InboundOutcome> => {
    const conversation = await findConversation(deps, input.to);
    if (!conversation) return { stored: false, reason: 'unknown_token' };
    const { organizationId } = conversation;
    const application = await deps.applications.findById(organizationId, conversation.applicationId);
    const candidate = application ? await deps.candidates.findById(organizationId, application.candidateId) : null;
    if (!application || !candidate) return { stored: false, reason: 'unknown_application' };
    if (await deps.messages.findByInboundMessageId(organizationId, input.messageId)) return { stored: false, reason: 'duplicate' };
    const message = toMessage(deps, input, organizationId, application.id, candidate);
    try {
      // A savepoint: a unique violation in a race must not abort the whole transaction.
      await inSavepoint(deps, (sp) => sp.messages.create(message));
    } catch (error) {
      if (error instanceof ConflictError) return { stored: false, reason: 'duplicate' };
      throw error;
    }
    return { stored: true, message };
  },
});

export async function receiveInboundEmail(deps: InboundDeps, rawInput: unknown): Promise<InboundResult> {
  const { stored, reason } = await storeInboundEmail(deps, rawInput);
  return reason === undefined ? { stored } : { stored, reason };
}
