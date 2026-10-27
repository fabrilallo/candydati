import { completeJobContent } from '@candydati/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { createLiveAnalyzer } from './ad-quality.js';

const generators = vi.hoisted(() => ({ built: [] as unknown[] }));
vi.mock('@candydati/providers', () => ({
  createMastraGenerator: (model: unknown) => {
    generators.built.push(model);
    return async () => {
      throw new Error('model unavailable');
    };
  },
}));

describe('createLiveAnalyzer', () => {
  it('has no score without a fast model: unavailable, and asking for one rejects instead of scoring with the rules', async () => {
    const analyzer = createLiveAnalyzer(() => null, { warn: vi.fn() });
    expect(analyzer.available()).toBe(false);
    await expect(analyzer.analyze(completeJobContent())).rejects.toThrow(/no fast model/);
  });

  it('falls back to rules and logs only the error message when the model fails', async () => {
    const warn = vi.fn();
    const analyzer = createLiveAnalyzer(() => ({ id: 'openai/m' }), { warn });
    expect(analyzer.available()).toBe(true);
    expect((await analyzer.analyze(completeJobContent())).source).toBe('rules');
    expect(warn).toHaveBeenCalledWith({ reason: 'model unavailable' }, expect.any(String));
  });

  it('follows the fast model in force at each call, and builds one generator per distinct model', async () => {
    generators.built.length = 0;
    let model: { id: `${string}/${string}`; apiKey?: string } | null = null;
    const warn = vi.fn();
    const analyzer = createLiveAnalyzer(() => model, { warn });
    expect(analyzer.available()).toBe(false);
    model = { id: 'anthropic/m', apiKey: 'sk' };
    expect(analyzer.available()).toBe(true);
    await analyzer.analyze(completeJobContent());
    await analyzer.analyze(completeJobContent());
    expect(generators.built).toEqual([{ id: 'anthropic/m', apiKey: 'sk' }]);
    expect(warn).toHaveBeenCalledTimes(2);
    model = null;
    expect(analyzer.available()).toBe(false);
  });
});
