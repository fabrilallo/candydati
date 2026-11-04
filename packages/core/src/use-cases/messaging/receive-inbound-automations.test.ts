import { describe, expect, it } from 'vitest';
import { buildApplication, failingAuditLog, seedMessagingWorld, ORG_A } from '../../testing/index.js';
import { receiveInboundEmail, type InboundEmail } from './receive-inbound-email.js';

const TOKEN = 'a'.repeat(24);
const world = (options: Parameters<typeof seedMessagingWorld>[0] = {}) =>
  seedMessagingWorld({ messaging: { conversations: [{ applicationId: 'app_1', organizationId: ORG_A, token: TOKEN }] }, ...options });
const email = (overrides: Partial<InboundEmail> = {}): InboundEmail => ({
  to: [`reply+${TOKEN}@in.platform.example`],
  from: 'ada@example.com',
  subject: 'Re: Hi',
  text: 'Sono disponibile.',
  messageId: '<m1@mail.example>',
  receivedAt: new Date('2026-06-01T09:00:00Z'),
  ...overrides,
});
const runs = (deps: ReturnType<typeof world>) => deps.queue.jobs().filter((job) => job.name === 'automation.run');

describe('receiveInboundEmail: the candidate replied trigger', () => {
  it('queues the candidate_replied rules of the current stage, once per stored message', async () => {
    const deps = world();
    await receiveInboundEmail(deps, email());
    const [message] = deps.messagingStore.read().messages;
    expect(runs(deps)).toEqual([
      { name: 'automation.run', payload: { organizationId: ORG_A, applicationId: 'app_1', stageId: 'received', trigger: 'candidate_replied', occurrence: `message:${message?.id}` } },
    ]);
    await receiveInboundEmail(deps, email());
    expect(runs(deps)).toHaveLength(1);
  });

  it('does not fire for a sender who is not the candidate, nor for a decided application', async () => {
    const stranger = world();
    await receiveInboundEmail(stranger, email({ from: 'someone@else.example' }));
    expect(runs(stranger)).toEqual([]);
    const decided = world({ applications: [buildApplication({ organizationId: ORG_A, outcome: 'hired', closedAt: new Date('2026-05-01') })] });
    await receiveInboundEmail(decided, email());
    expect(decided.messagingStore.read().messages).toHaveLength(1);
    expect(runs(decided)).toEqual([]);
  });

  it('queues nothing when the message is not stored', async () => {
    const deps = world();
    await expect(receiveInboundEmail({ ...deps, auditLog: failingAuditLog(new Error('db')) }, email())).rejects.toThrow();
    expect(runs(deps)).toEqual([]);
  });
});
