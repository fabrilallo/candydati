import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, type ValidationError } from '../../errors.js';
import { ORG_A, userActor } from '../../testing/index.js';
import { createInstanceAiWorld } from '../../testing/instance-ai-deps.js';
import { getInstanceAiSettings, updateInstanceAiSettings } from './instance-ai.js';

const OWNER = userActor({ id: 'owner', role: 'owner', organizationId: ORG_A });
const INPUT = { assistant: { provider: 'openai', model: 'gpt-6-luna' }, fast: { provider: 'google', model: 'gemini-3.1-flash-lite' }, keys: { openai: 'sk-o', google: 'g-k' } } as const;
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const issuesOf = async (promise: Promise<unknown>) => ((await rejection(promise)) as ValidationError).issues;

describe('getInstanceAiSettings', () => {
  it('says no model is configured, and who may configure it', async () => {
    const world = createInstanceAiWorld();
    expect(await getInstanceAiSettings(world, OWNER, {})).toEqual({
      source: 'none', canManage: true, assistant: null, fast: null, assistantEnabled: false, fastEnabled: false, storedKeys: [], verifiedAt: null,
    });
    expect((await getInstanceAiSettings(world, userActor({ id: 'r', role: 'recruiter', organizationId: ORG_A }), {})).canManage).toBe(false);
  });

  it('is read-only when the environment sets the models, and shows them', async () => {
    const world = createInstanceAiWorld({ environment: { assistant: 'openai/gpt-x', fast: null } });
    expect(await getInstanceAiSettings(world, OWNER, {})).toMatchObject({ source: 'environment', canManage: false, assistant: { provider: 'openai', model: 'gpt-x' }, assistantEnabled: true, fastEnabled: false });
  });
});

describe('updateInstanceAiSettings', () => {
  it('tests each model with the key of its provider, then seals the keys, saves, applies at once and audits', async () => {
    const world = createInstanceAiWorld();
    const view = await updateInstanceAiSettings(world, OWNER, INPUT);
    expect(world.checked()).toEqual([{ id: 'openai/gpt-6-luna', apiKey: 'sk-o' }, { id: 'google/gemini-3.1-flash-lite', apiKey: 'g-k' }]);
    expect(world.stored()).toMatchObject({ assistantProvider: 'openai', assistantModel: 'gpt-6-luna', fastProvider: 'google', fastModel: 'gemini-3.1-flash-lite', updatedBy: 'owner' });
    expect(world.stored()?.keysCiphertext).not.toMatch(/sk-o|g-k/);
    expect(world.refreshes()).toBe(1);
    expect(view).toMatchObject({ source: 'app', storedKeys: ['google', 'openai'], assistantEnabled: true, fastEnabled: true });
    expect(JSON.stringify(view)).not.toMatch(/sk-o|g-k/);
    expect(world.auditLog.events()[0]).toMatchObject({ action: 'ai_settings.updated', target: { type: 'instance_ai_settings', id: 'instance' }, metadata: { assistant: 'openai', fast: 'google' } });
  });

  it('saves nothing when a model refuses the test, and says which and why', async () => {
    const world = createInstanceAiWorld({ refuse: 'gemini-3.1-flash-lite' });
    expect(await issuesOf(updateInstanceAiSettings(world, OWNER, INPUT))).toEqual([{ path: 'test', message: 'ai_test_failed' }, { path: 'test.detail', message: 'fast: model not found' }]);
    expect(world.stored()).toBeNull();
  });

  it('keeps the stored key of a provider when left out, and keeps only the keys of providers in use', async () => {
    const world = createInstanceAiWorld();
    await updateInstanceAiSettings(world, OWNER, INPUT);
    await updateInstanceAiSettings(world, OWNER, { assistant: INPUT.assistant, fast: { provider: 'openai', model: 'gpt-6-mini' }, keys: {} });
    expect(world.checked().slice(-2)).toEqual([{ id: 'openai/gpt-6-luna', apiKey: 'sk-o' }, { id: 'openai/gpt-6-mini', apiKey: 'sk-o' }]);
    expect((await getInstanceAiSettings(world, OWNER, {})).storedKeys).toEqual(['openai']);
  });

  it('needs a key for the provider of each model switched on, and saves both off without a test', async () => {
    const world = createInstanceAiWorld();
    expect(await issuesOf(updateInstanceAiSettings(world, OWNER, { ...INPUT, keys: { openai: 'sk-o' } }))).toEqual([{ path: 'keys.google', message: 'required' }]);
    const off = await updateInstanceAiSettings(world, OWNER, { assistant: null, fast: null, keys: {} });
    expect(off).toMatchObject({ assistantEnabled: false, fastEnabled: false, storedKeys: [] });
    expect(world.checked()).toEqual([]);
  });

  it('is refused to anyone but the instance administrator, and when the environment decides', async () => {
    const world = createInstanceAiWorld();
    expect(await rejection(updateInstanceAiSettings(world, userActor({ id: 'someone', role: 'owner', organizationId: ORG_A }), INPUT))).toBeInstanceOf(ForbiddenError);
    expect(await rejection(updateInstanceAiSettings(createInstanceAiWorld({ environment: { assistant: 'openai/x', fast: null } }), OWNER, INPUT))).toBeInstanceOf(ConflictError);
    expect(world.checked()).toEqual([]);
  });
});
