import { defaultEmailTemplate, renderTemplate, SYSTEM_SENDER, type Job, type Message } from '@tt/domain';
import type { TaskQueue } from '../../intake-ports.js';
import type { ReceiptDeps } from '../../messaging-ports.js';
import { enqueueDelivery } from './send-message.js';
import { buildTemplateValues, ensureConversation, oneLine } from './shared.js';

export interface ReceiptInput {
  readonly organization: { readonly id: string; readonly name: string; readonly slug: string };
  readonly job: Job;
  readonly applicationId: string;
  readonly candidate: { readonly id: string; readonly firstName: string; readonly lastName: string };
}

/**
 * The only automatic message (PLAN §6): the application receipt, with the organization's `receipt` template or the
 * default one in the language of the ad. Never throws: the application is already stored and must not fail because of
 * an email. Returns whether the receipt was queued; failures go to `receipts.onError`.
 */
export async function queueReceipt(
  deps: { readonly receipts: ReceiptDeps; readonly queue: TaskQueue; readonly newId: () => string; readonly now: () => Date },
  input: ReceiptInput,
): Promise<boolean> {
  const { receipts } = deps;
  try {
    const stored = await receipts.templates.findByKind(input.organization.id, 'receipt');
    const template = stored ?? defaultEmailTemplate('receipt', input.job.content.language);
    const values = buildTemplateValues({
      config: receipts.config,
      organization: input.organization,
      job: input.job,
      candidate: input.candidate,
      stageId: 'received',
    });
    await ensureConversation(receipts, input.organization.id, input.applicationId);
    const message: Message = await receipts.messages.create({
      id: deps.newId(),
      organizationId: input.organization.id,
      applicationId: input.applicationId,
      candidateId: input.candidate.id,
      direction: 'outbound',
      subject: oneLine(renderTemplate(template.subject, values).text),
      bodyText: renderTemplate(template.body, values).text,
      status: 'queued',
      providerMessageId: null,
      sentBy: SYSTEM_SENDER,
      createdAt: deps.now(),
      sentAt: null,
      error: null,
      rawText: null,
      unverifiedSender: false,
      inboundMessageId: null,
    });
    return await enqueueDelivery({ queue: deps.queue, messages: receipts.messages }, message);
  } catch (error) {
    receipts.onError?.(error);
    return false;
  }
}
