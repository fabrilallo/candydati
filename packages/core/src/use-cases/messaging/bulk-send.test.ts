import { describe, expect, it } from 'vitest';
import { buildApplication, buildCandidate, seedMessagingWorld, userActor, ORG_A } from '../../testing/index.js';
import type { TransactionPort } from '../../transaction.js';
import { SEND_CHUNK, sendMessage } from './send-message.js';

const recruiter = userActor({ id: 'user_r', role: 'recruiter', organizationId: ORG_A });

const world = (count: number) =>
  seedMessagingWorld({
    candidates: Array.from({ length: count }, (_, i) => buildCandidate({ id: `cand_${i}`, organizationId: ORG_A, email: `p${i}@x.it`, firstName: `P${i}` })),
    applications: Array.from({ length: count }, (_, i) => buildApplication({ id: `app_${i}`, candidateId: `cand_${i}`, organizationId: ORG_A })),
  });

describe('bulk send (#22)', () => {
  it('stores the messages in one transaction per chunk, not one autocommit per statement', async () => {
    const count = SEND_CHUNK + 1;
    const deps = world(count);
    let transactions = 0;
    const counting: TransactionPort = { run: (work) => (transactions += 1, deps.transaction.run(work)) };
    const result = await sendMessage({ ...deps, transaction: counting }, recruiter, { applicationIds: Array.from({ length: count }, (_, i) => `app_${i}`), subject: 'Hi {{ candidate.firstName }}', body: 'b' });
    expect(transactions).toBe(2);
    expect(result).toEqual({ queued: count, failed: 0 });
    expect(deps.messagingStore.read().messages).toHaveLength(count);
    expect(deps.queue.jobs().filter((job) => job.name === 'email.send')).toHaveLength(count);
  });

  it('rolls back a whole chunk when one of its writes fails: no message is left without its task', async () => {
    const deps = world(3);
    let created = 0;
    const messages = { ...deps.messages, create: async (message: Parameters<typeof deps.messages.create>[0]) => (created += 1) === 2 ? Promise.reject(new Error('db down')) : deps.messages.create(message) };
    await expect(sendMessage({ ...deps, messages }, recruiter, { applicationIds: ['app_0', 'app_1', 'app_2'], subject: 's', body: 'b' })).rejects.toThrow('db down');
    expect(deps.messagingStore.read().messages).toEqual([]);
    expect(deps.queue.jobs()).toEqual([]);
  });
});
