import { describe, expect, it, vi } from 'vitest';
import { createLiveSuggester, responsibilityPrompt } from './responsibility-suggester.js';

const generators = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@candydati/providers', () => ({
  createMastraGenerator: (model: unknown) => async (request: unknown) => {
    generators.calls.push({ model, request });
    return { responsibilities: ['a', 'b', 'c'] };
  },
}));

const context = { title: 'Dev', role: null, seniority: 'senior', language: 'en', existing: ['Writes code'], summary: '' } as const;

describe('responsibilityPrompt', () => {
  it('carries only the ad: language, title, role, seniority and the lines already written', () => {
    const prompt = responsibilityPrompt(context);
    expect(prompt).toContain('Language: en.');
    expect(prompt).toContain('Job title: Dev.');
    expect(prompt).toContain('Role: not given. Seniority: senior.');
    expect(prompt).toContain('- Writes code');
    expect(prompt).toContain('There is no summary yet.');
  });
});

describe('createLiveSuggester', () => {
  it('follows the fast model in force: unavailable without one, a call with it', async () => {
    let model: { id: `${string}/${string}` } | null = null;
    const suggester = createLiveSuggester(() => model);
    expect(suggester.available()).toBe(false);
    await expect(suggester.suggest(context)).rejects.toThrow('No fast model');
    model = { id: 'openai/m' };
    expect(suggester.available()).toBe(true);
    expect(await suggester.suggest(context)).toEqual({ responsibilities: ['a', 'b', 'c'] });
    expect(generators.calls).toHaveLength(1);
  });
});
