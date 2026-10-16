import { completeJobContent } from '@candydati/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from '../testing/api-keys.js';
import { createWorld, type World } from '../testing/candidate-world.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { MCP_MAX_BATCH } from './batch.js';

let t: TestApp;
let world: World;

beforeAll(async () => {
  t = await createTestApp({
    rateLimit: { max: 100_000, authMax: 100_000, authEmailMax: 100_000, apiKeyMax: 30 },
    env: { FAST_MODEL: 'test/fake-model', MCP_MODEL_DAILY_BUDGET_PER_KEY: '2', MCP_MODEL_DAILY_BUDGET_PER_ORGANIZATION: '3' },
  });
  world = await createWorld(t, 'Mcp Limits Org');
});
afterAll(async () => {
  await t.close();
});

const rpc = (id: number, name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

const post = (secret: string, body: unknown) =>
  t.app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { authorization: `Bearer ${secret}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
    payload: body as object,
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-RPC results read back from the wire
const results = (body: string): any[] => [JSON.parse(body)].flat();

describe('MCP limits (M8)', () => {
  it('refuses a batch above the cap before running anything', async () => {
    const key = await createKey(world.owner, ['job:read']);
    const reply = await post(key.secret, Array.from({ length: MCP_MAX_BATCH + 1 }, (_, i) => rpc(i, 'list_jobs')));
    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toMatchObject({ error: { code: -32600 } });
  });

  it('charges every tool call of a batch to the key: 20 calls spend 20 of its 30 per minute', async () => {
    const key = await createKey(world.owner, ['job:read']);
    expect((await post(key.secret, Array.from({ length: 20 }, (_, i) => rpc(i, 'list_jobs')))).statusCode).toBe(200);
    expect((await post(key.secret, Array.from({ length: 11 }, (_, i) => rpc(i, 'list_jobs')))).statusCode).toBe(429);
  });

  it('stops model-backed tools at the daily budget of the key, then of the organization', async () => {
    const first = await createKey(world.owner, ['job:read', 'job:create', 'job:update']);
    const content = completeJobContent();
    const analyze = async (secret: string) => results((await post(secret, rpc(1, 'analyze_job_ad', { content }))).body)[0].result;
    const once = await analyze(first.secret);
    expect(once.isError, once.content[0].text).toBeFalsy();
    expect((await analyze(first.secret)).isError).toBeFalsy();
    const third = await analyze(first.secret);
    expect(third.isError).toBe(true);
    expect(third.content[0].text).toMatch(/rate_limited: .*this API key/);
    const second = await createKey(world.owner, ['job:read', 'job:create', 'job:update']);
    expect((await analyze(second.secret)).isError).toBeFalsy();
    expect((await analyze(second.secret)).content[0].text).toMatch(/rate_limited: .*organization/);
  });

  it('audits reads as mcp.read with the tool name and ids, never the data', async () => {
    const key = await createKey(world.owner, ['job:read']);
    const reply = await post(key.secret, rpc(1, 'get_job', { jobId: world.job.id }));
    expect(results(reply.body)[0].result.isError).toBeFalsy();
    const log = await world.owner.get<{ action: string; actor: { type: string; id: string }; metadata: Record<string, unknown> }[]>('/api/v1/audit-log?limit=50');
    const read = log.body.data!.find((event) => event.action === 'mcp.read' && event.actor.id === key.id);
    expect(read).toMatchObject({ actor: { type: 'api_key' }, metadata: { tool: 'get_job', jobId: world.job.id } });
    expect(Object.keys(read!.metadata).sort()).toEqual(['jobId', 'tool']);
  });
});

describe('MCP model budget per person (L2)', () => {
  let perUser: TestApp;
  let owner: World['owner'];
  beforeAll(async () => {
    perUser = await createTestApp({
      rateLimit: { max: 100_000, authMax: 100_000, authEmailMax: 100_000 },
      env: { FAST_MODEL: 'test/fake-model', MCP_MODEL_DAILY_BUDGET_PER_KEY: '2', MCP_MODEL_DAILY_BUDGET_PER_ORGANIZATION: '100', MCP_MODEL_DAILY_BUDGET_PER_USER: '3' },
    });
    owner = (await createWorld(perUser, 'Mcp Person Org')).owner;
  });
  afterAll(async () => {
    await perUser.close();
  });

  it('a person cannot get around the key budget with more keys', async () => {
    const analyze = async (secret: string) =>
      results(
        (
          await perUser.app.inject({
            method: 'POST',
            url: '/mcp',
            headers: { authorization: `Bearer ${secret}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
            payload: rpc(1, 'analyze_job_ad', { content: completeJobContent() }),
          })
        ).body,
      )[0].result;
    const first = await createKey(owner, ['job:read', 'job:create', 'job:update']);
    const second = await createKey(owner, ['job:read', 'job:create', 'job:update']);
    expect((await analyze(first.secret)).isError).toBeFalsy();
    expect((await analyze(first.secret)).isError).toBeFalsy();
    expect((await analyze(second.secret)).isError).toBeFalsy();
    const fourth = await analyze(second.secret);
    expect(fourth.isError).toBe(true);
    expect(fourth.content[0].text).toMatch(/rate_limited: .*the person/);
  });
});
