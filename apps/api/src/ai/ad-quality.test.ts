import { completeJobContent } from '@candydati/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { createConfiguredAnalyzer, createLiveAnalyzer } from './ad-quality.js';

const generators = vi.hoisted(() => ({ built: [] as unknown[] }));
vi.mock('@candydati/providers', () => ({
  createMastraGenerator: (model: unknown) => {
    generators.built.push(model);
    return async () => {
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

describe('createLiveAnalyzer', () => {
  it('follows the fast model in force at each call, and builds one generator per distinct model', async () => {
    generators.built.length = 0;
    let model: { id: `${string}/${string}`; apiKey?: string } | null = null;
    const warn = vi.fn();
    const analyzer = createLiveAnalyzer(() => model, { warn });
    await analyzer.analyze(completeJobContent());
    expect(warn).not.toHaveBeenCalled();
    model = { id: 'anthropic/m', apiKey: 'sk' };
    await analyzer.analyze(completeJobContent());
    await analyzer.analyze(completeJobContent());
    expect(generators.built).toEqual([{ id: 'anthropic/m', apiKey: 'sk' }]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
