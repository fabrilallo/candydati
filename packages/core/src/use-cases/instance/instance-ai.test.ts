import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, type ValidationError } from '../../errors.js';
import { ORG_A, userActor } from '../../testing/index.js';
import { createInstanceAiWorld } from '../../testing/instance-ai-deps.js';
import { getInstanceAiSettings, updateInstanceAiSettings } from './instance-ai.js';

const OWNER = userActor({ id: 'owner', role: 'owner', organizationId: ORG_A });
const INPUT = { provider: 'anthropic', apiKey: 'sk-secret', assistantModel: 'claude-sonnet-5-5', fastModel: 'claude-haiku-5-5' } as const;
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('getInstanceAiSettings', () => {
  it('says no model is configured, and who may configure it', async () => {
    const world = createInstanceAiWorld();
    expect(await getInstanceAiSettings(world, OWNER, {})).toEqual({
      source: 'none', canManage: true, provider: null, hasApiKey: false, assistantModel: null, fastModel: null, assistantEnabled: false, fastEnabled: false, verifiedAt: null,
    });
    expect((await getInstanceAiSettings(world, userActor({ id: 'r', role: 'recruiter', organizationId: ORG_A }), {})).canManage).toBe(false);
  });

  it('is read-only when the environment sets the models, and shows them', async () => {
    const world = createInstanceAiWorld({ environment: { assistant: 'openai/gpt-x', fast: null } });
    expect(await getInstanceAiSettings(world, OWNER, {})).toMatchObject({ source: 'environment', canManage: false, assistantModel: 'openai/gpt-x', assistantEnabled: true, fastEnabled: false });
  });
});

describe('updateInstanceAiSettings', () => {
  it('tests each chosen model with the key, then seals the key, saves, applies at once and audits', async () => {
    const world = createInstanceAiWorld();
    const view = await updateInstanceAiSettings(world, OWNER, INPUT);
    expect(world.checked()).toEqual([{ id: 'anthropic/claude-sonnet-5-5', apiKey: 'sk-secret' }, { id: 'anthropic/claude-haiku-5-5', apiKey: 'sk-secret' }]);
    expect(world.stored()).toMatchObject({ provider: 'anthropic', assistantModel: 'claude-sonnet-5-5', fastModel: 'claude-haiku-5-5', updatedBy: 'owner' });
    expect(world.stored()?.secretCiphertext).not.toContain('sk-secret');
    expect(world.refreshes()).toBe(1);
    expect(view).toMatchObject({ source: 'app', hasApiKey: true, assistantEnabled: true, fastEnabled: true });
    expect(JSON.stringify(view)).not.toContain('sk-secret');
    expect(world.auditLog.events()[0]).toMatchObject({ action: 'ai_settings.updated', target: { type: 'instance_ai_settings', id: 'instance' }, metadata: { provider: 'anthropic', assistant: true, fast: true } });
  });

  it('saves nothing when a model refuses the test, and says which and why', async () => {
    const world = createInstanceAiWorld({ refuse: 'claude-haiku-5-5' });
    const error = await rejection(updateInstanceAiSettings(world, OWNER, INPUT));
    expect((error as ValidationError).issues).toEqual([{ path: 'test', message: 'ai_test_failed' }, { path: 'test.detail', message: 'fastModel: model not found' }]);
    expect(world.stored()).toBeNull();
  });

  it('keeps the stored key when left empty, needs one when a model is on, and saves both off without a test', async () => {
    const world = createInstanceAiWorld();
    await updateInstanceAiSettings(world, OWNER, INPUT);
    await updateInstanceAiSettings(world, OWNER, { ...INPUT, apiKey: undefined, assistantModel: null });
    expect(world.checked().at(-1)).toEqual({ id: 'anthropic/claude-haiku-5-5', apiKey: 'sk-secret' });
    const fresh = createInstanceAiWorld();
    expect(((await rejection(updateInstanceAiSettings(fresh, OWNER, { ...INPUT, apiKey: undefined }))) as ValidationError).issues).toEqual([{ path: 'apiKey', message: 'required' }]);
    const off = await updateInstanceAiSettings(fresh, OWNER, { provider: 'anthropic', assistantModel: null, fastModel: null });
    expect(off).toMatchObject({ assistantEnabled: false, fastEnabled: false });
    expect(fresh.checked()).toEqual([]);
  });

  it('does not reuse a key stored for another provider', async () => {
    const world = createInstanceAiWorld();
    await updateInstanceAiSettings(world, OWNER, INPUT);
    expect(((await rejection(updateInstanceAiSettings(world, OWNER, { ...INPUT, provider: 'openai', apiKey: undefined }))) as ValidationError).issues).toEqual([{ path: 'apiKey', message: 'required' }]);
  });

  it('is refused to anyone but the instance administrator, and when the environment decides', async () => {
    const world = createInstanceAiWorld();
    expect(await rejection(updateInstanceAiSettings(world, userActor({ id: 'someone', role: 'owner', organizationId: ORG_A }), INPUT))).toBeInstanceOf(ForbiddenError);
    expect(await rejection(updateInstanceAiSettings(createInstanceAiWorld({ environment: { assistant: 'openai/x', fast: null } }), OWNER, INPUT))).toBeInstanceOf(ConflictError);
    expect(world.checked()).toEqual([]);
  });
});
