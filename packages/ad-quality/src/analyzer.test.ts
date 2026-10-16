import { QUALITY_CATEGORIES, adQualityReportSchema, totalOf } from '@candydati/domain';
import { describe, expect, it, vi } from 'vitest';
import { createAdQualityAnalyzer } from './analyzer.js';
import type { StructuredGenerator } from './generator.js';
import { createModelAnalyzer, normalizeScore } from './model-analyzer.js';
import { draft, richAd } from './testing/fixtures.js';

const modelAnswer = (overrides: Record<string, unknown> = {}) => ({
  scores: {
    role_requirements: 1,
    benefits: 0.5,
    growth: 0,
    work_life_balance: 1,
    responsibilities_clarity: 0.5,
    culture: 1,
    technologies: 1,
    ...((overrides['scores'] as object | undefined) ?? {}),
  },
  vaguePhrases: [],
  improvements: ['Aggiungi il budget formazione'],
  ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'scores')),
});

const generating = (answer: unknown): StructuredGenerator => vi.fn(() => Promise.resolve(answer));

describe('model analyzer', () => {
  it('turns a valid answer into a valid report with source model', async () => {
    const generate = generating(modelAnswer());
    const report = await createModelAnalyzer(generate).analyze(richAd());
    expect(adQualityReportSchema.parse(report).source).toBe('model');
    expect(report.scores.benefits).toBe(0.5);
    expect(report.scores.growth).toBe(0);
    expect(report.improvements).toEqual(['Aggiungi il budget formazione']);
  });

  it('sends the built prompt and a schema to the generator', async () => {
    const generate = vi.fn(() => Promise.resolve(modelAnswer()));
    await createModelAnalyzer(generate).analyze(richAd());
    const request = generate.mock.calls[0]?.[0] as unknown as { system: string; prompt: string; schema: { safeParse: (v: unknown) => { success: boolean } } };
    expect(request.prompt).toContain('BEGIN JOB AD');
    expect(request.system).toContain('selection_process');
    expect(request.schema.safeParse(modelAnswer()).success).toBe(true);
  });

  it('recomputes the total locally and ignores any total from the model', async () => {
    const report = await createModelAnalyzer(generating(modelAnswer({ total: 10 }))).analyze(richAd());
    expect(report.total).toBe(totalOf(report.scores));
    expect(report.total).not.toBe(10);
  });

  it('clamps and rounds scores to the 0.5 grid', async () => {
    const answer = modelAnswer({ scores: { benefits: 7, growth: -3, culture: 0.8, technologies: 0.2 } });
    const report = await createModelAnalyzer(generating(answer)).analyze(richAd());
    expect([report.scores.benefits, report.scores.growth, report.scores.culture, report.scores.technologies]).toEqual([1, 0, 1, 0]);
    expect(normalizeScore(0.74)).toBe(0.5);
  });

  it('takes the structural categories from the rules, not from the model', async () => {
    const answer = modelAnswer({ scores: { selection_process: 0, work_mode: 0, salary_transparency: 0 } });
    const report = await createModelAnalyzer(generating(answer)).analyze(richAd());
    expect(report.scores.selection_process).toBe(1);
    expect(report.scores.work_mode).toBe(1);
    expect(report.scores.salary_transparency).toBe(1);
    const sparse = await createModelAnalyzer(generating(modelAnswer({ scores: { salary_transparency: 1 } }))).analyze(draft());
    expect(sparse.scores.salary_transparency).toBe(0);
    expect(sparse.improvements[0]).toMatch(/retribuzione/);
  });

  it('drops vague phrases that do not occur literally in the ad', async () => {
    const content = richAd({ culture: 'Siamo come una famiglia e lavoriamo in un ambiente dinamico.' });
    const answer = modelAnswer({
      vaguePhrases: [
        { text: 'come una famiglia', category: 'culture', suggestion: 'Descrivi una pratica concreta' },
        { text: 'Come Una Famiglia', category: 'culture', suggestion: 'wrong casing' },
        { text: 'stipendio top', category: 'salary_transparency', suggestion: 'invented quote' },
        { text: 'ambiente dinamico', category: 'culture', suggestion: '   ' },
        { text: 'come una famiglia', category: 'culture', suggestion: 'duplicate' },
      ],
    });
    const report = await createModelAnalyzer(generating(answer)).analyze(content);
    expect(report.vaguePhrases).toEqual([{ text: 'come una famiglia', category: 'culture', suggestion: 'Descrivi una pratica concreta' }]);
  });

  it('rejects an answer that fails validation', async () => {
    await expect(createModelAnalyzer(generating({ scores: { benefits: 'high' } })).analyze(richAd())).rejects.toThrow();
    await expect(createModelAnalyzer(generating(null)).analyze(richAd())).rejects.toThrow();
    await expect(createModelAnalyzer(generating(modelAnswer({ scores: { growth: Number.NaN } }))).analyze(richAd())).rejects.toThrow();
  });

  it('rejects when the generator throws', async () => {
    const failing: StructuredGenerator = () => Promise.reject(new Error('boom'));
    await expect(createModelAnalyzer(failing).analyze(richAd())).rejects.toThrow('boom');
  });

  it('caps and trims improvements', async () => {
    const answer = modelAnswer({ improvements: ['  ', ...Array.from({ length: 30 }, (_, i) => `linea ${i}`)] });
    const report = await createModelAnalyzer(generating(answer)).analyze(draft());
    expect(report.improvements).toHaveLength(20);
    expect(() => adQualityReportSchema.parse(report)).not.toThrow();
  });

  it('does not mutate the content', async () => {
    const content = richAd();
    const before = structuredClone(content);
    await createModelAnalyzer(generating(modelAnswer())).analyze(content);
    expect(content).toEqual(before);
  });
});

describe('createAdQualityAnalyzer', () => {
  it('is the rules analyzer without a generator', async () => {
    const report = await createAdQualityAnalyzer().analyze(richAd());
    expect(report.source).toBe('rules');
    expect(createAdQualityAnalyzer({})).toBeDefined();
  });

  it('uses the model when it answers', async () => {
    const onModelError = vi.fn();
    const report = await createAdQualityAnalyzer({ generate: generating(modelAnswer()), onModelError }).analyze(richAd());
    expect(report.source).toBe('model');
    expect(onModelError).not.toHaveBeenCalled();
  });

  it('falls back to the rules and reports the error when the model throws', async () => {
    const onModelError = vi.fn();
    const error = new Error('timeout');
    const report = await createAdQualityAnalyzer({ generate: () => Promise.reject(error), onModelError }).analyze(richAd());
    expect(report.source).toBe('rules');
    expect(onModelError).toHaveBeenCalledWith(error);
    expect(() => adQualityReportSchema.parse(report)).not.toThrow();
  });

  it('falls back when the model output is invalid', async () => {
    const onModelError = vi.fn();
    const report = await createAdQualityAnalyzer({ generate: generating({ nope: true }), onModelError }).analyze(richAd());
    expect(report.source).toBe('rules');
    expect(onModelError).toHaveBeenCalledTimes(1);
  });

  it('falls back without a handler and survives a handler that throws', async () => {
    const failing: StructuredGenerator = () => Promise.reject(new Error('x'));
    expect((await createAdQualityAnalyzer({ generate: failing }).analyze(draft())).source).toBe('rules');
    const throwing = () => {
      throw new Error('handler');
    };
    expect((await createAdQualityAnalyzer({ generate: failing, onModelError: throwing }).analyze(draft())).source).toBe('rules');
  });

  it('produces reports covering the ten categories', async () => {
    const report = await createAdQualityAnalyzer().analyze(draft());
    expect(Object.keys(report.scores).sort()).toEqual([...QUALITY_CATEGORIES].sort());
  });
});
