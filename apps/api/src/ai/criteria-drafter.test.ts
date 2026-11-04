import { describe, expect, it, vi } from 'vitest';
import { createLiveCriteriaDrafter, criteriaPrompt } from './criteria-drafter.js';

const generators = vi.hoisted(() => ({ calls: [] as { model: unknown; request: { system: string; prompt: string } }[] }));
vi.mock('@candydati/providers', () => ({
  createMastraGenerator: (model: unknown) => async (request: { system: string; prompt: string }) => {
    generators.calls.push({ model, request });
    return { criteria: ['Postgres experience', 'English B2', 'Client communication'] };
  },
}));

const context = {
  language: 'en',
  title: 'Backend developer',
  responsibilities: ['Design APIs'],
  requirements: ['Postgres'],
  preferred: [],
  stages: ['technical_interview'],
  existing: ['English B2'],
} as const;

describe('criteriaPrompt', () => {
  it('carries only the ad and the criteria already written', () => {
    const prompt = criteriaPrompt(context);
    expect(prompt).toContain('Language: en.');
    expect(prompt).toContain('- Design APIs');
    expect(prompt).toContain('- Postgres');
    expect(prompt).toContain('Nice-to-have requirements: none.');
    expect(prompt).toContain('Criteria already written (do not repeat):\n- English B2');
  });
});

describe('createLiveCriteriaDrafter', () => {
  it('follows the fast model in force and asks for labels, never a score', async () => {
    let model: { provider: string; model: string } | null = null;
    const drafter = createLiveCriteriaDrafter(() => model as never);
    expect(drafter.available()).toBe(false);
    await expect(drafter.draft(context)).rejects.toThrow();
    model = { provider: 'openai', model: 'gpt-test' };
    expect(drafter.available()).toBe(true);
    expect(await drafter.draft(context)).toEqual({ criteria: ['Postgres experience', 'English B2', 'Client communication'] });
    expect(generators.calls.at(-1)?.request.system).toMatch(/Never a score, weight, scale/);
  });
});
