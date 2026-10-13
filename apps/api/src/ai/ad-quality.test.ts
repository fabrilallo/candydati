import { completeJobContent } from '@tt/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { createConfiguredAnalyzer } from './ad-quality.js';

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    generate = async () => {
      throw new Error('model unavailable');
    };
  },
}));

describe('createConfiguredAnalyzer', () => {
  it('uses rules only without FAST_MODEL', async () => {
    const report = await createConfiguredAnalyzer(undefined, { warn: vi.fn() }).analyze(completeJobContent());
    expect(report.source).toBe('rules');
  });

  it('falls back to rules and logs only the error message when the model fails', async () => {
    const warn = vi.fn();
    const report = await createConfiguredAnalyzer('openai/m', { warn }).analyze(completeJobContent());
    expect(report.source).toBe('rules');
    expect(warn).toHaveBeenCalledWith({ reason: 'model unavailable' }, expect.any(String));
  });
});
