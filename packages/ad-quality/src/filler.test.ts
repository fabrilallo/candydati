import { DEFAULT_AD_QUALITY_THRESHOLD, adQualityReportSchema } from '@candydati/domain';
import { describe, expect, it, vi } from 'vitest';
import type { StructuredGenerator } from './generator.js';
import { createModelAnalyzer } from './model-analyzer.js';
import { QUALITY_SYSTEM_PROMPT } from './prompt.js';
import { analyzeWithRules } from './rules-analyzer.js';
import { junkAd, richAd } from './testing/fixtures.js';

/** A model as generous as the one the tester met: full marks to whatever text is there. */
const generousModel: StructuredGenerator = vi.fn(() =>
  Promise.resolve({
    scores: { role_requirements: 1, benefits: 1, growth: 1, work_life_balance: 1, responsibilities_clarity: 1, culture: 1, technologies: 1 },
    vaguePhrases: [],
    improvements: [],
  }),
);

describe('ads written with filler text', () => {
  it('score clearly below the default threshold with the rules, whatever the structured fields', () => {
    const report = analyzeWithRules(junkAd());
    expect(report.total).toBeLessThanOrEqual(DEFAULT_AD_QUALITY_THRESHOLD - 2);
    expect(report.scores).toMatchObject({
      role_requirements: 0,
      responsibilities_clarity: 0,
      technologies: 0,
      growth: 0,
      work_life_balance: 0,
      culture: 0,
    });
    expect(() => adQualityReportSchema.parse(report)).not.toThrow();
  });

  it('keep the facts the structured fields give: salary, work mode, process, contract benefits', () => {
    const { scores } = analyzeWithRules(junkAd());
    expect([scores.salary_transparency, scores.work_mode, scores.selection_process]).toEqual([1, 1, 1]);
    expect(scores.benefits).toBe(0.5);
  });

  it('tell the author which texts say nothing and what to write instead', () => {
    const report = analyzeWithRules(junkAd());
    const texts = report.vaguePhrases.map((phrase) => phrase.text);
    expect(texts).toEqual(expect.arrayContaining(['asdasd', 'bla bla bla bla', 'xxx', 'bla bla bla bla bla']));
    const phrase = report.vaguePhrases.find((item) => item.text === 'asdasd');
    expect(phrase?.category).toBe('responsibilities_clarity');
    expect(phrase?.suggestion).toMatch(/non dice nulla/);
    expect(report.improvements[0]).toMatch(/segnaposto/);
  });

  it('speak the language of the ad', () => {
    const report = analyzeWithRules(junkAd({ language: 'en' }));
    expect(report.improvements[0]).toMatch(/placeholders/);
    expect(report.vaguePhrases[0]?.suggestion).toMatch(/says nothing/);
  });

  it('only discount the filler items: real items in the same list still count', () => {
    const mixed = richAd({ technologies: ['TypeScript 5', 'Node.js 22', 'PostgreSQL 17', 'asd'] });
    const report = analyzeWithRules(mixed);
    expect(report.scores.technologies).toBe(1);
    expect(report.vaguePhrases.map((phrase) => phrase.text)).toEqual(['asd']);
  });

  it('leave a concrete ad untouched', () => {
    const report = analyzeWithRules(richAd());
    expect(report.total).toBe(10);
    expect(report.vaguePhrases).toEqual([]);
  });

  it('are capped also when a generous model scores the free text', async () => {
    const report = await createModelAnalyzer(generousModel).analyze(junkAd());
    expect(report.source).toBe('model');
    expect(report.total).toBeLessThanOrEqual(DEFAULT_AD_QUALITY_THRESHOLD - 2);
    expect(report.improvements[0]).toMatch(/segnaposto/);
    expect(report.vaguePhrases.map((phrase) => phrase.text)).toContain('asdasd');
    expect(() => adQualityReportSchema.parse(report)).not.toThrow();
  });

  it('does not cap the model on a concrete ad', async () => {
    const report = await createModelAnalyzer(generousModel).analyze(richAd());
    expect(report.total).toBe(10);
  });

  it('asks the model to treat filler as absent', () => {
    expect(QUALITY_SYSTEM_PROMPT).toMatch(/placeholder/i);
    expect(QUALITY_SYSTEM_PROMPT).toMatch(/lorem ipsum/i);
  });
});
