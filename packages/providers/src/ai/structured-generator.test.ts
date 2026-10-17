import { z } from 'zod';
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

const { createMastraGenerator, GENERATOR_TEMPERATURE } = await import('./structured-generator.js');

const request = { system: 'SYSTEM', prompt: 'PROMPT', schema: z.object({ a: z.number() }) };

beforeEach(() => {
  generate.mockReset();
  construct.mockReset();
});

describe('createMastraGenerator', () => {
  it('builds a tool-less agent on the model string and passes system and prompt through untouched', async () => {
    generate.mockResolvedValue({ object: { a: 1 } });
    const result = await createMastraGenerator('openai/some-model')(request);
    expect(result).toEqual({ a: 1 });
    const config = construct.mock.calls[0]![0] as Record<string, unknown>;
    expect(config).toMatchObject({ instructions: 'SYSTEM', model: 'openai/some-model' });
    expect(config).not.toHaveProperty('tools');
    const [prompt, options] = generate.mock.calls[0]! as [string, { structuredOutput: { schema: unknown }; modelSettings: { temperature: number }; abortSignal: unknown }];
    expect(prompt).toBe('PROMPT');
    expect(options.structuredOutput.schema).toBe(request.schema);
    expect(options.modelSettings.temperature).toBe(GENERATOR_TEMPERATURE);
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('throws when the model returns no object', async () => {
    generate.mockResolvedValue({});
    await expect(createMastraGenerator('openai/m')(request)).rejects.toThrow('no structured output');
  });

  it('propagates model errors for the analyzer to fall back on', async () => {
    generate.mockRejectedValue(new Error('boom'));
    await expect(createMastraGenerator('openai/m')(request)).rejects.toThrow('boom');
  });
  it('passes an explicit key to the model when one is given (settings saved from the app)', async () => {
    generate.mockResolvedValue({ object: { a: 1 } });
    await createMastraGenerator({ id: 'anthropic/some-model', apiKey: 'sk-app' })(request);
    expect((construct.mock.calls[0]![0] as Record<string, unknown>).model).toEqual({ id: 'anthropic/some-model', apiKey: 'sk-app' });
  });
});
