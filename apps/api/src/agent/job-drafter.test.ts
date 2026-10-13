import { completeJobContent } from '@tt/core/testing';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createModelJobDrafter, draftPrompt } from './job-drafter.js';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

const jsonModel = (value: unknown) =>
  new MockLanguageModelV3({
    doGenerate: async () =>
      ({ content: [{ type: 'text', text: JSON.stringify(value) }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }) as never,
    doStream: async () =>
      ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: JSON.stringify(value) },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
          ] as never[],
        }),
      }) as never,
  });

describe('job drafter', () => {
  it('returns content validated by the job content schema', async () => {
    const content = completeJobContent({ title: 'Data Engineer' });
    const model = jsonModel(content);
    const result = await createModelJobDrafter(model)({ brief: 'Data engineer a Milano', base: null, language: 'it' });
    expect(result).toEqual(content);
    expect(JSON.stringify([...model.doStreamCalls, ...model.doGenerateCalls].map((c) => c.prompt))).toContain('Data engineer a Milano');
  });

  it('rejects output that is not a job content', async () => {
    await expect(createModelJobDrafter(jsonModel({ nope: true }))({ brief: 'x', base: null, language: 'en' })).rejects.toThrow();
  });

  it('puts the current draft and the language in the prompt', () => {
    const prompt = draftPrompt({ brief: 'b', base: completeJobContent({ title: 'Base title' }), language: 'en' });
    expect(prompt).toContain('Language of the ad: en.');
    expect(prompt).toContain('Base title');
    expect(draftPrompt({ brief: 'b', base: null, language: 'it' })).toContain('There is no current draft.');
  });
});
