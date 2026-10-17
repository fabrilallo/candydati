import { describe, expect, it } from 'vitest';
import { createAiRuntime, hasProviderKey, toMastraModel, type StoredAiSettings } from './runtime.js';

const STORED: StoredAiSettings = { provider: 'anthropic', apiKey: 'sk-app', assistantModel: 'claude-sonnet-5-5', fastModel: 'claude-haiku-5-5', verifiedAt: new Date('2026-10-17T10:00:00Z') };
const noLog = () => undefined;

describe('createAiRuntime', () => {
  it('has no model without environment nor saved settings', async () => {
    const runtime = createAiRuntime({ env: { keys: {} }, load: async () => null, log: noLog });
    await runtime.refresh();
    expect(runtime.snapshot()).toMatchObject({ source: 'none', assistant: null, fast: null });
  });

  it('uses the saved settings: provider prefix and the key passed explicitly to each model', async () => {
    const runtime = createAiRuntime({ env: { keys: {} }, load: async () => STORED, log: noLog });
    await runtime.refresh();
    expect(runtime.snapshot()).toMatchObject({
      source: 'app', provider: 'anthropic', verifiedAt: STORED.verifiedAt,
      assistant: { id: 'anthropic/claude-sonnet-5-5', apiKey: 'sk-app' }, fast: { id: 'anthropic/claude-haiku-5-5', apiKey: 'sk-app' },
    });
  });

  it('switches a role off when its model is null, and both off without a key', async () => {
    const runtime = createAiRuntime({ env: { keys: {} }, load: async () => ({ ...STORED, fastModel: null }), log: noLog });
    await runtime.refresh();
    expect(runtime.snapshot()).toMatchObject({ assistant: { id: 'anthropic/claude-sonnet-5-5' }, fast: null });
    const keyless = createAiRuntime({ env: { keys: {} }, load: async () => ({ ...STORED, apiKey: null }), log: noLog });
    await keyless.refresh();
    expect(keyless.snapshot()).toMatchObject({ assistant: null, fast: null });
  });

  it('lets AGENT_MODEL or FAST_MODEL in the environment win, and enables a model only with its provider key', async () => {
    const env = { agentModel: 'openai/gpt-x', fastModel: 'mistral/small', keys: { OPENAI_API_KEY: 'sk-env' } };
    const runtime = createAiRuntime({ env, load: async () => STORED, log: noLog });
    await runtime.refresh();
    expect(runtime.snapshot()).toMatchObject({ source: 'environment', assistant: { id: 'openai/gpt-x' }, fast: null });
    expect(runtime.snapshot().assistant?.apiKey).toBeUndefined();
  });

  it('keeps the last good settings when loading fails, without logging any key', async () => {
    const lines: string[] = [];
    let fail = false;
    const runtime = createAiRuntime({ env: { keys: {} }, load: async () => (fail ? Promise.reject(new Error('db down')) : STORED), log: (line) => lines.push(line) });
    await runtime.refresh();
    fail = true;
    await runtime.refresh();
    expect(runtime.snapshot().source).toBe('app');
    expect(lines.join('\n')).not.toContain('sk-app');
  });
});

describe('hasProviderKey and toMastraModel', () => {
  it('needs the key of a known provider, lets an unknown one through (the router decides)', () => {
    expect(hasProviderKey('openai/x', {})).toBe(false);
    expect(hasProviderKey('openai/x', { OPENAI_API_KEY: ' k ' })).toBe(true);
    expect(hasProviderKey('custom/x', {})).toBe(true);
  });

  it('passes the key explicitly when it has one, else the string the router resolves from the environment', () => {
    expect(toMastraModel({ id: 'anthropic/m', apiKey: 'k' })).toEqual({ id: 'anthropic/m', apiKey: 'k' });
    expect(toMastraModel({ id: 'anthropic/m' })).toBe('anthropic/m');
  });
});
