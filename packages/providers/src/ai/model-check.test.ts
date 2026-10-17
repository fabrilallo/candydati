import { beforeEach, describe, expect, it, vi } from 'vitest';

const generate = vi.fn();
const construct = vi.fn();
vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    constructor(config: unknown) {
      construct(config);
    }
    generate = generate;
  },
}));
const { checkAiModel } = await import('./model-check.js');

beforeEach(() => {
  generate.mockReset();
  construct.mockReset();
});

describe('checkAiModel', () => {
  it('asks the model for a one-word answer with the key passed explicitly', async () => {
    generate.mockResolvedValue({ text: 'OK' });
    await checkAiModel({ id: 'anthropic/m', apiKey: 'sk' });
    expect((construct.mock.calls[0]![0] as { model: unknown }).model).toEqual({ id: 'anthropic/m', apiKey: 'sk' });
    expect(generate.mock.calls[0]![1]).toMatchObject({ modelSettings: { maxRetries: 0 } });
  });

  it('fails on an empty answer and passes the provider message through', async () => {
    generate.mockResolvedValue({ text: '  ' });
    await expect(checkAiModel({ id: 'anthropic/m', apiKey: 'sk' })).rejects.toThrow(/no answer/);
    generate.mockRejectedValue(new Error('invalid x-api-key'));
    await expect(checkAiModel({ id: 'anthropic/m', apiKey: 'sk' })).rejects.toThrow('invalid x-api-key');
  });
});
