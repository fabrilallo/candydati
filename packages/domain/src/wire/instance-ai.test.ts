import { describe, expect, it } from 'vitest';
import { instanceAiSettingsInputSchema, instanceAiSettingsSchema } from './instance-ai.js';

const INPUT = { provider: 'anthropic', apiKey: 'sk-ant-x', assistantModel: 'claude-sonnet-5-5', fastModel: 'claude-haiku-5-5' };

describe('instanceAiSettingsInputSchema', () => {
  it('takes a known provider, its key and a model name per role, each one optional (off)', () => {
    expect(instanceAiSettingsInputSchema.parse(INPUT)).toEqual(INPUT);
    expect(instanceAiSettingsInputSchema.parse({ ...INPUT, assistantModel: null, fastModel: null })).toMatchObject({ assistantModel: null, fastModel: null });
  });

  it('lets the key be left out to keep the stored one, and trims model names', () => {
    expect(instanceAiSettingsInputSchema.parse({ ...INPUT, apiKey: undefined, fastModel: '  claude-haiku-5-5 ' })).toMatchObject({ fastModel: 'claude-haiku-5-5' });
  });

  it('refuses an unknown provider, a provider prefix in the model name and blank names', () => {
    const fails = (value: object) => !instanceAiSettingsInputSchema.safeParse(value).success;
    expect(fails({ ...INPUT, provider: 'acme' })).toBe(true);
    expect(fails({ ...INPUT, assistantModel: 'anthropic/claude' })).toBe(true);
    expect(fails({ ...INPUT, fastModel: '  ' })).toBe(true);
    expect(fails({ ...INPUT, assistantModel: 'has space' })).toBe(true);
  });
});

describe('instanceAiSettingsSchema', () => {
  it('describes the settings without the key', () => {
    const dto = instanceAiSettingsSchema.parse({
      source: 'app', canManage: true, provider: 'anthropic', hasApiKey: true,
      assistantModel: 'claude-sonnet-5-5', fastModel: null, assistantEnabled: true, fastEnabled: false, verifiedAt: '2026-10-17T10:00:00.000Z',
    });
    expect(JSON.stringify(dto)).not.toContain('apiKey"');
  });
});
