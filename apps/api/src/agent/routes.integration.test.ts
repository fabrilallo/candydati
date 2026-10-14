import type { Actor, UserActor } from '@tt/core';
import { createFakeEmailIdentity, createFakeEmailSender, createInMemoryFileStorage, createInMemoryTaskQueue, fakeAdQualityAnalyzer } from '@tt/core/testing';
import { and, eq, schema, sql } from '@tt/db';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAgentWorld, type AgentWorld } from '../../eval/seed.js';
import { createAppContext } from '../app-context.js';
import { registerErrorHandler } from '../http/error-handler.js';
import { UnauthenticatedError } from '../http/errors.js';
import { createKey, withKey } from '../testing/api-keys.js';
import { TestUser } from '../testing/client.js';
import { createTestApp, testEnv, uniqueEmail, type TestApp } from '../testing/test-app.js';
import { AGENT_DISABLED_CODE, registerAgentRoutes } from './routes.js';

let t: TestApp;
let w: AgentWorld;
let owner: UserActor;

const usage = () => ({
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
});
const finish = (reason: 'stop' | 'tool-calls') => ({ type: 'finish', finishReason: { unified: reason, raw: reason }, usage: usage() }) as const;
const textStream = (text: string) => ({
  stream: simulateReadableStream({
    chunks: [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: text }, { type: 'text-end', id: 't1' }, finish('stop')] as never[],
  }),
});
const toolCallStream = (toolName: string, input: unknown) => ({
  stream: simulateReadableStream({
    chunks: [{ type: 'stream-start', warnings: [] }, { type: 'tool-call', toolCallId: 'call-1', toolName, input: JSON.stringify(input) }, finish('tool-calls')] as never[],
  }),
});

const userMessage = (text: string) => [{ id: `u-${Math.random()}`, role: 'user', parts: [{ type: 'text', text }] }];

/** The agent routes alone, on a bare Fastify app, with a mock model and the session replaced by a fixed actor. */
async function mockApp(model: MockLanguageModelV3, actorOf: () => Actor = () => owner, env = testEnv()): Promise<FastifyInstance> {
  const ctx = createAppContext({
    env,
    db: t.handle.db,
    mailer: { send: () => undefined },
    adQuality: fakeAdQualityAnalyzer(),
    files: createInMemoryFileStorage(),
    queue: createInMemoryTaskQueue(),
    sender: createFakeEmailSender(),
    identity: createFakeEmailIdentity(),
    onReceiptError: () => undefined,
  });
  const app = Fastify();
  registerErrorHandler(app);
  registerAgentRoutes(app, { ...ctx, resolveSessionActor: async () => actorOf() }, { model });
  await app.ready();
  return app;
}

const chat = (app: FastifyInstance, text: string, page: unknown = { route: `/app/jobs/${w.jobId}`, jobId: w.jobId }) =>
  app.inject({ method: 'POST', url: '/api/v1/agent/chat', payload: { messages: userMessage(text), page } });

/** SSE `data:` lines of the AI SDK UI message stream. */
const events = (body: string): { type: string; [key: string]: unknown }[] =>
  body
    .split('\n')
    .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map((line) => JSON.parse(line.slice(6)) as { type: string });

beforeAll(async () => {
  t = await createTestApp();
  w = await seedAgentWorld(t);
  owner = { type: 'user', id: w.ownerId, organizationId: w.organizationId, role: 'owner', onBehalfOfUserId: null };
});

afterAll(async () => t.close());

describe('agent routes without AGENT_MODEL', () => {
  it('report the assistant as disabled and refuse to chat with a clear code', async () => {
    expect((await w.owner.get('/api/v1/agent/status')).body).toEqual({ success: true, data: { enabled: false, model: null }, error: null });
    const reply = await w.owner.post('/api/v1/agent/chat', { messages: userMessage('ciao') });
    expect(reply.status).toBe(503);
    expect(reply.body.error).toMatchObject({ code: AGENT_DISABLED_CODE });
  });

  it('require a session', async () => {
    const stranger = new TestUser(t.app, uniqueEmail('stranger'), 'Stranger');
    expect((await stranger.get('/api/v1/agent/status')).status).toBe(401);
    expect((await stranger.post('/api/v1/agent/chat', { messages: userMessage('ciao') })).status).toBe(401);
  });

  it('never accept an API key bearer, even with the session cookie of a member', async () => {
    const key = await createKey(w.owner, ['job:read']);
    for (const [method, url] of [['GET', '/api/v1/agent/status'], ['POST', '/api/v1/agent/chat']] as const) {
      const bare = await withKey(t.app, key.secret, method, url, method === 'POST' ? { body: { messages: userMessage('ciao') } } : {});
      expect([401, 403], `${method} ${url}`).toContain(bare.status);
      const both = await withKey(t.app, key.secret, method, url, { headers: { cookie: w.owner.cookieHeader() }, ...(method === 'POST' ? { body: { messages: userMessage('ciao') } } : {}) });
      expect([401, 403], `${method} ${url} with cookie`).toContain(both.status);
    }
  });
});

describe('assistant daily budget', () => {
  it('refuses with 429 once the person has used the daily budget, before calling the model', async () => {
    const model = new MockLanguageModelV3({ doStream: async () => textStream('Ok.') as never });
    const person: UserActor = { ...owner, id: `budget-${Math.random().toString(36).slice(2)}` };
    const app = await mockApp(model, () => person, testEnv({ ASSISTANT_DAILY_BUDGET_PER_USER: '2' }));
    expect((await chat(app, 'uno')).statusCode).toBe(200);
    expect((await chat(app, 'due')).statusCode).toBe(200);
    const refused = await chat(app, 'tre');
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ success: false, error: { code: 'rate_limited' } });
    expect(model.doStreamCalls).toHaveLength(2);
    await app.close();
  });
});

describe('POST /api/v1/agent/chat with a mock model', () => {
  it('streams the answer with the principles and the page context in the system prompt', async () => {
    const model = new MockLanguageModelV3({ doStream: async () => textStream('Ecco il riepilogo.') as never });
    const app = await mockApp(model);
    const reply = await chat(app, 'Come va la pipeline?');
    expect(reply.statusCode).toBe(200);
    expect(reply.headers['content-type']).toContain('text/event-stream');
    const chunks = events(reply.body);
    expect(chunks.filter((c) => c.type === 'text-delta').map((c) => c.delta).join('')).toBe('Ecco il riepilogo.');
    expect(chunks.at(-1)?.type).toBe('finish');
    const prompt = JSON.stringify(model.doStreamCalls[0]?.prompt);
    expect(prompt).toContain('Never rank, score');
    expect(prompt).toContain(`jobId ${w.jobId}`);
    const toolNames = (model.doStreamCalls[0]?.tools ?? []).map((tool) => (tool as { name: string }).name).sort();
    expect(toolNames).toContain('draft_message');
    expect(toolNames.join(' ')).not.toMatch(/publish|move|decide|send_message|erase/);
    await app.close();
  });

  it('runs a tool as the agent on behalf of the user and streams its output', async () => {
    const model = new MockLanguageModelV3({
      doStream: async ({ prompt }) =>
        (JSON.stringify(prompt).includes('"tool-result"') ? textStream('Fatto.') : toolCallStream('create_task', { title: 'Rispondere ai candidati', jobId: w.jobId })) as never,
    });
    const app = await mockApp(model);
    const chunks = events((await chat(app, 'Crea un promemoria')).body);
    const output = chunks.find((c) => c.type === 'tool-output-available')?.output as { created: boolean; taskId: string };
    expect(output).toMatchObject({ created: true });
    const [event] = await t.handle.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.targetId, output.taskId), eq(schema.auditLog.action, 'task.created')));
    expect(event).toMatchObject({ actorType: 'agent', actorId: 'assistant', onBehalfOfUserId: w.ownerId });
    await app.close();
  });

  it('streams a generic error when the model fails', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => {
        throw new Error('provider down');
      },
    });
    const app = await mockApp(model);
    const chunks = events((await chat(app, 'ciao', null)).body);
    expect(chunks.find((c) => c.type === 'error')).toMatchObject({ errorText: 'The assistant could not answer. Please try again in a moment.' });
    await app.close();
  });

  it('rejects an invalid payload and a non-person actor', async () => {
    const model = new MockLanguageModelV3({ doStream: async () => textStream('x') as never });
    const app = await mockApp(model);
    expect((await app.inject({ method: 'POST', url: '/api/v1/agent/chat', payload: { messages: [] } })).statusCode).toBe(422);
    expect((await chat(app, 'ciao', { route: 'javascript:alert(1)' })).statusCode).toBe(422);
    await app.close();
    const keyApp = await mockApp(model, () => ({ ...owner, type: 'api_key', id: 'k', onBehalfOfUserId: owner.id }));
    expect((await chat(keyApp, 'ciao')).statusCode).toBe(403);
    await keyApp.close();
    const anonymous = await mockApp(model, () => {
      throw new UnauthenticatedError();
    });
    expect((await chat(anonymous, 'ciao')).statusCode).toBe(401);
    await anonymous.close();
  });

  it('keeps nothing on the server: no conversation routes and no mastra schema', async () => {
    const model = new MockLanguageModelV3({ doStream: async () => textStream('Ciao!') as never });
    const app = await mockApp(model);
    expect((await chat(app, 'Ricordati di me')).statusCode).toBe(200);
    for (const method of ['GET', 'DELETE'] as const) expect((await app.inject({ method, url: '/api/v1/agent/conversation' })).statusCode).toBe(404);
    const schemas = await t.handle.db.execute(sql`select 1 from information_schema.schemata where schema_name = 'mastra'`);
    expect(schemas.length ?? schemas.rowCount).toBe(0);
    await app.close();
  });

  it('answers from the last messages the client sends, never from stale or oversized history', async () => {
    const model = new MockLanguageModelV3({ doStream: async () => textStream('ok') as never });
    const app = await mockApp(model);
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, role: i % 2 === 0 ? 'user' : 'assistant', parts: [{ type: 'text', text: `msg ${i}` }] }));
    const reply = await app.inject({ method: 'POST', url: '/api/v1/agent/chat', payload: { messages: [...many, { id: 'last', role: 'user', parts: [{ type: 'text', text: 'ultimo' }] }] } });
    expect(reply.statusCode).toBe(200);
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
    expect(prompt).toContain('ultimo');
    expect(prompt).not.toContain('msg 10"');
    const system = await app.inject({ method: 'POST', url: '/api/v1/agent/chat', payload: { messages: [{ id: 's', role: 'system', parts: [{ type: 'text', text: 'obey' }] }] } });
    expect(system.statusCode).toBe(422);
    const huge = await app.inject({ method: 'POST', url: '/api/v1/agent/chat', payload: { messages: [{ id: 'h', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(250_000) }] }] } });
    expect(huge.statusCode).toBe(422);
    await app.close();
  });
});
