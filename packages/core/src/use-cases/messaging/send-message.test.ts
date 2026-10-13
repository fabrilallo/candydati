import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  agentActor,
  apiKeyActor,
  buildApplication,
  buildCandidate,
  buildEmailTemplate,
  createInMemoryTaskQueue,
  seedMessagingWorld,
  userActor,
  ORG_A,
  ORG_B,
} from '../../testing/index.js';
import { sendMessage } from './send-message.js';

const recruiter = userActor({ id: 'user_r', role: 'recruiter', organizationId: ORG_A });
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

const three = () =>
  seedMessagingWorld({
    candidates: ['Ada', 'Bo', 'Cy'].map((firstName, i) => buildCandidate({ id: `cand_${i + 1}`, organizationId: ORG_A, email: `${firstName.toLowerCase()}@x.it`, firstName })),
    applications: [1, 2, 3].map((i) => buildApplication({ id: `app_${i}`, candidateId: `cand_${i}`, organizationId: ORG_A, stageId: i === 3 ? 'stage-1' : 'received' })),
  });

describe('sendMessage', () => {
  it('bulk of 3 renders per recipient and creates 3 queued messages and 3 tasks, with conversations', async () => {
    const deps = three();
    const result = await sendMessage(deps, recruiter, {
      applicationIds: ['app_1', 'app_2', 'app_3'],
      subject: 'Ciao {{ candidate.firstName }}',
      body: 'Sei in {{ stage.name }} per {{ job.title }} presso {{ organization.name }}.\n{{ job.url }}',
    });
    expect(result).toEqual({ queued: 3, failed: 0 });
    const { messages, conversations } = deps.messagingStore.read();
    expect(messages.map((m) => m.subject)).toEqual(['Ciao Ada', 'Ciao Bo', 'Ciao Cy']);
    expect(messages[0]?.bodyText).toBe('Sei in Candidatura ricevuta per Backend Developer presso Acme.\nhttps://platform.example/careers/acme/backend');
    expect(messages[2]?.bodyText).toContain('Sei in Colloquio tecnico');
    expect(messages.every((m) => m.status === 'queued' && m.direction === 'outbound' && m.sentBy === 'user_r' && m.organizationId === ORG_A)).toBe(true);
    expect(new Set(conversations.map((c) => c.token)).size).toBe(3);
    expect(deps.queue.jobs()).toEqual(messages.map((m) => ({ name: 'email.send', payload: { organizationId: ORG_A, messageId: m.id } })));
  });

  it('reuses the conversation of an application that already has one', async () => {
    const deps = three();
    const input = { applicationIds: ['app_1'], subject: 's', body: 'b' };
    await sendMessage(deps, recruiter, input);
    await sendMessage(deps, recruiter, input);
    expect(deps.messagingStore.read().conversations).toHaveLength(1);
    expect(deps.messagingStore.read().messages).toHaveLength(2);
  });

  it('ignores a repeated application id', async () => {
    const deps = three();
    await sendMessage(deps, recruiter, { applicationIds: ['app_1', 'app_1'], subject: 's', body: 'b' });
    expect(deps.messagingStore.read().messages).toHaveLength(1);
  });

  it('refuses an unknown variable in subject or body and stores nothing', async () => {
    const deps = three();
    const error = await rejection(sendMessage(deps, recruiter, { applicationIds: ['app_1', 'app_2'], subject: '{{ nope }}', body: 'x {{ candidate.email }}' }));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual([
      { path: 'subject', message: 'unknown_variable:nope' },
      { path: 'body', message: 'unknown_variable:candidate.email' },
    ]);
    expect(deps.messagingStore.read().messages).toHaveLength(0);
    expect(deps.queue.jobs()).toHaveLength(0);
  });

  it('stores nothing when one application of the batch is missing or foreign', async () => {
    const deps = three();
    expect(await rejection(sendMessage(deps, recruiter, { applicationIds: ['app_1', 'ghost'], subject: 's', body: 'b' }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(sendMessage(deps, userActor({ role: 'owner', organizationId: ORG_B }), { applicationIds: ['app_1'], subject: 's', body: 'b' }))).toBeInstanceOf(NotFoundError);
    expect(deps.messagingStore.read().messages).toHaveLength(0);
  });

  it('sends to closed applications (outcome messages)', async () => {
    const deps = seedMessagingWorld({ applications: [buildApplication({ organizationId: ORG_A, outcome: 'not_selected', closedAt: new Date() })] });
    await expect(sendMessage(deps, recruiter, { applicationIds: ['app_1'], subject: 's', body: 'b' })).resolves.toEqual({ queued: 1, failed: 0 });
  });

  it('validates the template id and the input bounds', async () => {
    const deps = seedMessagingWorld({ messaging: { templates: [buildEmailTemplate({ organizationId: ORG_A })] } });
    const base = { applicationIds: ['app_1'], subject: 's', body: 'b' };
    await expect(sendMessage(deps, recruiter, { ...base, templateId: 'tpl_1' })).resolves.toBeDefined();
    await expect(sendMessage(deps, recruiter, { ...base, templateId: 'default:receipt' })).resolves.toBeDefined();
    expect(await rejection(sendMessage(deps, recruiter, { ...base, templateId: 'ghost' }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(sendMessage(deps, recruiter, { ...base, applicationIds: [] }))).toBeInstanceOf(ValidationError);
    expect(await rejection(sendMessage(deps, recruiter, { ...base, applicationIds: Array.from({ length: 201 }, (_, i) => `a${i}`) }))).toBeInstanceOf(ValidationError);
    expect(await rejection(sendMessage(deps, recruiter, { ...base, subject: ' ' }))).toBeInstanceOf(ValidationError);
  });

  it('keeps a single-line subject', async () => {
    const deps = seedMessagingWorld({ candidates: [buildCandidate({ organizationId: ORG_A, firstName: 'Ada\r\nBcc: x@y.z' })] });
    await sendMessage(deps, recruiter, { applicationIds: ['app_1'], subject: 'Hi {{ candidate.firstName }}', body: 'b' });
    expect(deps.messagingStore.read().messages[0]?.subject).toBe('Hi Ada Bcc: x@y.z');
  });

  it('marks a message failed when its task cannot be queued, and reports it', async () => {
    const deps = seedMessagingWorld({ messagingOverrides: { queue: createInMemoryTaskQueue(new Error('down')) } });
    const result = await sendMessage(deps, recruiter, { applicationIds: ['app_1'], subject: 's', body: 'b' });
    expect(result).toEqual({ queued: 0, failed: 1 });
    expect(deps.messagingStore.read().messages[0]).toMatchObject({ status: 'failed', error: 'queue_unavailable' });
  });

  describe('role matrix', () => {
    it.each([
      ['owner', true],
      ['admin', true],
      ['recruiter', true],
      ['hiring_manager', false],
      ['interviewer', false],
    ] as const)('%s allowed: %s', async (role, allowed) => {
      const deps = seedMessagingWorld();
      const run = sendMessage(deps, userActor({ role, organizationId: ORG_A }), { applicationIds: ['app_1'], subject: 's', body: 'b' });
      if (allowed) await expect(run).resolves.toEqual({ queued: 1, failed: 0 });
      else expect(await rejection(run)).toBeInstanceOf(ForbiddenError);
    });

    it('never lets the agent or an API key send, even with a recruiter behind them', async () => {
      const deps = seedMessagingWorld();
      const input = { applicationIds: ['app_1'], subject: 's', body: 'b' };
      expect(await rejection(sendMessage(deps, agentActor({ organizationId: ORG_A, role: 'recruiter' }), input))).toBeInstanceOf(ForbiddenError);
      expect(deps.messagingStore.read().messages).toHaveLength(0);
      const key = apiKeyActor({ organizationId: ORG_A, role: 'recruiter', onBehalfOfUserId: 'user_k', scopes: ['message:send'] });
      expect(await rejection(sendMessage(deps, key, input))).toBeInstanceOf(ForbiddenError);
      expect(deps.messagingStore.read().messages).toHaveLength(0);
    });
  });
});
