import { createFakeEmailSender, seedMessagingWorld, buildMessage } from '@candydati/core/testing';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createEmailSendQueue } from './email-send.js';

const logger = pino({ level: 'silent' });

describe('email.send queue', () => {
  it('rejects a payload without ids', () => {
    const queue = createEmailSendQueue(seedMessagingWorld());
    expect(queue.payload.safeParse({ organizationId: 'org_a' }).success).toBe(false);
  });

  it('delivers a queued message and marks it sent', async () => {
    const deps = seedMessagingWorld();
    const message = await deps.messages.create(buildMessage({ organizationId: 'org_a', status: 'queued', direction: 'outbound', sentBy: 'system' }));
    await createEmailSendQueue(deps).handle({ jobId: 'j1', payload: { organizationId: 'org_a', messageId: message.id }, logger, lastAttempt: false });
    expect((await deps.messages.findById('org_a', message.id))?.status).toBe('sent');
  });

  it('rethrows a transient error while retries remain and fails the message on the last attempt', async () => {
    const deps = seedMessagingWorld({ messagingOverrides: { sender: createFakeEmailSender(new Error('timeout')) } });
    const message = await deps.messages.create(buildMessage({ organizationId: 'org_a', status: 'queued', direction: 'outbound', sentBy: 'system' }));
    const queue = createEmailSendQueue(deps);
    const payload = { organizationId: 'org_a', messageId: message.id };
    await expect(queue.handle({ jobId: 'j', payload, logger, lastAttempt: false })).rejects.toThrow('timeout');
    expect((await deps.messages.findById('org_a', message.id))?.status).toBe('queued');
    await queue.handle({ jobId: 'j', payload, logger, lastAttempt: true });
    expect((await deps.messages.findById('org_a', message.id))?.status).toBe('failed');
  });
});
