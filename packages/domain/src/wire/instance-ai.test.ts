import { describe, expect, it } from 'vitest';
import { instanceAiSettingsInputSchema, instanceAiSettingsSchema } from './instance-ai.js';

const INPUT = { assistant: { provider: 'openai', model: 'gpt-6-luna' }, fast: { provider: 'google', model: 'gemini-3.1-flash-lite' }, keys: { openai: 'sk-o', google: 'g-k' } };

describe('instanceAiSettingsInputSchema', () => {
  it('takes a provider and a model per role (each one can be off) and a key per provider', () => {
    expect(instanceAiSettingsInputSchema.parse(INPUT)).toEqual(INPUT);
    expect(instanceAiSettingsInputSchema.parse({ assistant: null, fast: null })).toEqual({ assistant: null, fast: null, keys: {} });
  });

  it('lets keys be left out to keep the stored ones, and trims model names', () => {
    expect(instanceAiSettingsInputSchema.parse({ ...INPUT, keys: undefined, fast: { provider: 'google', model: ' gemini-3.1-flash-lite ' } })).toMatchObject({ keys: {}, fast: { model: 'gemini-3.1-flash-lite' } });
  });

  it('refuses an unknown provider, a provider prefix in the model name, blank names and keys of unknown providers', () => {
    const fails = (value: object) => !instanceAiSettingsInputSchema.safeParse(value).success;
    expect(fails({ ...INPUT, assistant: { provider: 'acme', model: 'x' } })).toBe(true);
    expect(fails({ ...INPUT, assistant: { provider: 'openai', model: 'openai/gpt' } })).toBe(true);
    expect(fails({ ...INPUT, fast: { provider: 'google', model: '  ' } })).toBe(true);
    expect(fails({ ...INPUT, keys: { acme: 'k' } })).toBe(true);
  });
});

describe('instanceAiSettingsSchema', () => {
  it('describes the settings with the providers that have a key, never a key', () => {
    const dto = instanceAiSettingsSchema.parse({
      source: 'app', canManage: true, assistant: INPUT.assistant, fast: INPUT.fast, assistantEnabled: true, fastEnabled: true,
      storedKeys: ['google', 'openai'], verifiedAt: '2026-10-17T10:00:00.000Z',
    });
    expect(JSON.stringify(dto)).not.toMatch(/sk-o|g-k/);
  });
});
