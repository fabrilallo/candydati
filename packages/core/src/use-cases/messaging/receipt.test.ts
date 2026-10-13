import { describe, expect, it, vi } from 'vitest';
import {
  buildEmailTemplate,
  buildJob,
  completeJobContent,
  createInMemoryConversationRepository,
  createInMemoryEmailTemplateRepository,
  createInMemoryTaskQueue,
  createMessagingStore,
  createTokenGenerator,
  seedCandidateWorld,
  testMessagingConfig,
  validApplicationForm,
  fakePdfBytes,
  ORG_A,
} from '../../testing/index.js';
import type { ReceiptDeps } from '../../messaging-ports.js';
import { submitApplication } from '../candidates/submit-application.js';

const submission = () => ({ organizationSlug: 'acme', jobSlug: 'backend', form: validApplicationForm(), cv: { bytes: fakePdfBytes(), declaredName: 'cv.pdf' } });
const empty = () => seedCandidateWorld({ candidates: [], applications: [], extractions: [] });

function receiptsFor(deps: ReturnType<typeof empty>, overrides: Partial<ReceiptDeps> = {}): ReceiptDeps {
  const { messagingStore } = deps;
  return {
    templates: createInMemoryEmailTemplateRepository(messagingStore),
    conversations: createInMemoryConversationRepository(messagingStore),
    messages: deps.messages,
    config: testMessagingConfig,
    newToken: createTokenGenerator(),
    ...overrides,
  };
}

describe('application receipt', () => {
  it('queues the default receipt in the language of the ad, with a conversation and one email.send task', async () => {
    const deps = empty();
    await submitApplication({ ...deps, receipts: receiptsFor(deps) }, submission());
    const { messages, conversations } = deps.messagingStore.read();
    const application = deps.store.read().applications[0];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      organizationId: ORG_A,
      applicationId: application?.id,
      candidateId: application?.candidateId,
      direction: 'outbound',
      status: 'queued',
      sentBy: 'system',
      subject: 'Abbiamo ricevuto la tua candidatura per Backend Developer',
    });
    expect(messages[0]?.bodyText).toContain('Ciao Ada,');
    expect(messages[0]?.bodyText).toContain('entro 5 giorni');
    expect(messages[0]?.bodyText).toContain('https://platform.example/careers/acme/backend');
    expect(messages[0]?.bodyText).not.toContain('{{');
    expect(conversations).toHaveLength(1);
    expect(deps.queue.jobs()).toContainEqual({ name: 'email.send', payload: { organizationId: ORG_A, messageId: messages[0]?.id } });
  });

  it('uses English defaults for an English ad and the organization template when it has one', async () => {
    const english = empty();
    const job = buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', publishedAt: new Date(), content: completeJobContent({ title: 'Engineer', language: 'en' }) });
    const deps = seedCandidateWorld({ candidates: [], applications: [], extractions: [], jobs: [job] });
    await submitApplication({ ...deps, receipts: receiptsFor(deps) }, submission());
    expect(deps.messagingStore.read().messages[0]?.subject).toBe('We received your application for Engineer');
    expect(english.messagingStore.read().messages).toHaveLength(0);

    const custom = empty();
    custom.messagingStore.write({ templates: [buildEmailTemplate({ organizationId: ORG_A, kind: 'receipt', subject: 'Got it, {{ candidate.firstName }}', body: 'Thanks' })] });
    await submitApplication({ ...custom, receipts: receiptsFor(custom) }, submission());
    expect(custom.messagingStore.read().messages[0]).toMatchObject({ subject: 'Got it, Ada', bodyText: 'Thanks' });
  });

  it('sends nothing when receipts are not wired', async () => {
    const deps = empty();
    await submitApplication(deps, submission());
    expect(deps.messagingStore.read().messages).toHaveLength(0);
    expect(deps.queue.jobs().map((j) => j.name)).toEqual(['cv.extract']);
  });

  it('never fails the application when the receipt cannot be stored', async () => {
    const deps = empty();
    const onError = vi.fn();
    const broken = receiptsFor(deps, {
      messages: { ...deps.messages, create: async () => { throw new Error('db down'); } },
      onError,
    });
    await expect(submitApplication({ ...deps, receipts: broken }, submission())).resolves.toEqual({ received: true });
    expect(deps.store.read().applications).toHaveLength(1);
    expect(onError).toHaveBeenCalledOnce();
    expect(deps.queue.jobs().map((j) => j.name)).toEqual(['cv.extract']);
  });

  it('never fails the application when the template store or the queue breaks, and marks the receipt failed', async () => {
    const a = empty();
    const brokenTemplates = receiptsFor(a, { templates: { ...createInMemoryEmailTemplateRepository(createMessagingStore()), findByKind: async () => { throw new Error('x'); } } });
    await expect(submitApplication({ ...a, receipts: brokenTemplates }, submission())).resolves.toEqual({ received: true });

    const b = empty();
    const queue = createInMemoryTaskQueue();
    const failingEmailQueue = { enqueue: async (name: 'cv.extract' | 'email.send', payload: never) => { if (name === 'email.send') throw new Error('queue'); return queue.enqueue(name, payload); } } as typeof queue;
    await expect(submitApplication({ ...b, queue: failingEmailQueue, receipts: receiptsFor(b) }, submission())).resolves.toEqual({ received: true });
    expect(b.messagingStore.read().messages[0]).toMatchObject({ status: 'failed', error: 'queue_unavailable' });
  });
});
