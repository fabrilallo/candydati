import { z } from 'zod';
import type { SourcingDeps } from '../../sourcing-ports.js';
import { inTransaction } from '../../transaction.js';
import { defineSystemJob } from '../../use-case.js';
import { sendNoticeEmail } from './notice-mail.js';

/**
 * Worker (`sourcing.notice`): emails the art. 14 notice to a contact whose address is known, with a fresh link, and marks
 * them notified in the same transaction as the send: a failed send rolls back and the retried job sends again; a contact
 * erased or already notified meanwhile gets nothing.
 */
export const sendSourcingNotice = defineSystemJob<SourcingDeps, z.ZodObject<{ organizationId: z.ZodString; contactId: z.ZodString }>, { readonly sent: boolean }>({
  name: 'sendSourcingNotice',
  input: z.object({ organizationId: z.string().min(1), contactId: z.string().min(1) }),
  handler: async ({ deps, input }) =>
    inTransaction(deps, async (tx) => {
      const contact = await tx.contacts.findById(input.organizationId, input.contactId);
      if (!contact?.email || contact.noticeSentAt !== null) return { sent: false };
      const job = await tx.jobs.findById(contact.organizationId, contact.jobId);
      if (!job) return { sent: false };
      const secret = tx.newToken();
      await tx.contacts.update(contact.organizationId, contact.id, { noticeTokenHash: tx.hash(secret), noticeSentAt: tx.now(), status: contact.status === 'found' ? 'notified' : contact.status });
      if (!(await sendNoticeEmail({ ...tx, onError: undefined }, { ...contact, email: contact.email }, job, secret))) throw new Error('sourcing notice not sent');
      await tx.auditLog.append({ organizationId: contact.organizationId, actor: { type: 'system', id: 'sourcing_notice', onBehalfOfUserId: null }, action: 'sourced_contact.notified', target: { type: 'sourced_contact', id: contact.id }, metadata: {} });
      return { sent: true };
    }),
});
