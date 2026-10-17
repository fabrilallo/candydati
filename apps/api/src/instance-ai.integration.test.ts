import { schema } from '@candydati/db';
import type { AgentStatusDto, InstanceAiSettingsDto } from '@candydati/domain';
import type { AiModelCheck } from '@candydati/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from './testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

const ADMIN_EMAIL = uniqueEmail('ai-admin');
const checked: unknown[] = [];
let refuse: string | null = null;
const check: AiModelCheck = {
  async check(model) {
    if (refuse !== null) throw new Error(refuse);
    checked.push(model);
  },
};

let t: TestApp;
let admin: TestUser;
let colleague: TestUser;

beforeAll(async () => {
  t = await createTestApp({ env: { INSTANCE_ADMIN_EMAILS: ADMIN_EMAIL }, aiCheck: check });
  await t.handle.db.delete(schema.instanceAiSettings);
  admin = await new TestUser(t.app, ADMIN_EMAIL, 'Admin').signUp();
  await admin.createOrganization('AI Co');
  colleague = await new TestUser(t.app, uniqueEmail('ai-colleague'), 'Colleague').signUp();
  await colleague.createOrganization('Other AI Co');
});
afterAll(async () => {
  await t.handle.db.delete(schema.instanceAiSettings);
  await t.close();
});

const settingsOf = async (user: TestUser) => (await user.get<InstanceAiSettingsDto>('/api/v1/instance/ai-settings')).body.data!;
const assistantOf = async (user: TestUser) => (await user.get<AgentStatusDto>('/api/v1/agent/status')).body.data!;
const INPUT = { assistant: { provider: 'openai', model: 'gpt-6-luna' }, fast: { provider: 'google', model: 'gemini-3.1-flash-lite' }, keys: { openai: 'sk-openai-secret', google: 'google-secret' } };

describe('instance AI settings from the app', () => {
  it('starts with no model: the assistant is off', async () => {
    expect(await settingsOf(admin)).toMatchObject({ source: 'none', canManage: true, assistantEnabled: false, fastEnabled: false });
    expect(await assistantOf(admin)).toEqual({ enabled: false, model: null });
  });

  it('saves nothing when a model refuses the test call, and is changed only by the instance administrator', async () => {
    refuse = 'invalid x-api-key';
    const reply = await admin.put('/api/v1/instance/ai-settings', INPUT);
    refuse = null;
    expect(reply.status).toBe(422);
    expect(JSON.stringify(reply.body)).toContain('ai_test_failed');
    expect(await t.handle.db.select().from(schema.instanceAiSettings)).toEqual([]);
    expect((await colleague.put('/api/v1/instance/ai-settings', INPUT)).status).toBe(403);
  });

  it('saves after the test calls, seals the key and switches the assistant on at once, then off again', async () => {
    const reply = await admin.put('/api/v1/instance/ai-settings', INPUT);
    expect(reply.status).toBe(200);
    expect(checked).toEqual([{ id: 'openai/gpt-6-luna', apiKey: 'sk-openai-secret' }, { id: 'google/gemini-3.1-flash-lite', apiKey: 'google-secret' }]);
    expect(JSON.stringify(reply.body)).not.toMatch(/sk-openai-secret|google-secret/);
    const [row] = await t.handle.db.select().from(schema.instanceAiSettings);
    expect(row?.keysCiphertext).toMatch(/^sb1\./);
    expect(await assistantOf(colleague)).toEqual({ enabled: true, model: 'openai/gpt-6-luna' });
    expect(await settingsOf(colleague)).toMatchObject({ source: 'app', canManage: false, storedKeys: ['google', 'openai'], fastEnabled: true });

    expect((await admin.put('/api/v1/instance/ai-settings', { assistant: null, fast: null })).status).toBe(200);
    expect(await assistantOf(admin)).toEqual({ enabled: false, model: null });
  });
});
