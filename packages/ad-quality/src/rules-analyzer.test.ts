import { QUALITY_CATEGORIES, adQualityReportSchema, jobContentSchema, type Employment, type JobContent } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { analyzeWithRules, createRulesAnalyzer } from './rules-analyzer.js';
import { draft, richAd } from './testing/fixtures.js';

const scoreOf = (content: JobContent, category: (typeof QUALITY_CATEGORIES)[number]): number => analyzeWithRules(content).scores[category];

describe('rules analyzer', () => {
  it('scores an empty draft 0 everywhere', () => {
    const report = analyzeWithRules(draft());
    for (const category of QUALITY_CATEGORIES) expect(report.scores[category]).toBe(0);
    expect(report.total).toBe(0);
    expect(report.vaguePhrases).toEqual([]);
    expect(report.improvements).toHaveLength(10);
    expect(report.source).toBe('rules');
    expect(() => adQualityReportSchema.parse(report)).not.toThrow();
  });

  it('scores a rich, concrete ad at least 8, in fact 10', () => {
    const report = analyzeWithRules(richAd());
    expect(report.total).toBeGreaterThanOrEqual(8);
    expect(report.total).toBe(10);
    expect(report.improvements).toEqual([]);
    expect(() => adQualityReportSchema.parse(report)).not.toThrow();
  });

  it('resolves through the AdQualityAnalyzer port', async () => {
    const report = await createRulesAnalyzer().analyze(richAd());
    expect(adQualityReportSchema.parse(report).source).toBe('rules');
  });

  describe('selection_process', () => {
    const stage = { type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' } as const;
    it('0 without stages', () => expect(scoreOf(draft(), 'selection_process')).toBe(0));
    it('0.5 with stages but no response time', () =>
      expect(scoreOf(draft({ process: [stage] }), 'selection_process')).toBe(0.5));
    it('1 with stages and response time', () =>
      expect(scoreOf(draft({ process: [stage], responseDays: 5 }), 'selection_process')).toBe(1));
  });

  describe('salary_transparency', () => {
    const score = (min?: number, max?: number) =>
      scoreOf(draft({ salary: { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }), currency: 'EUR', period: 'year' } }), 'salary_transparency');
    it('0 with none', () => expect(score()).toBe(0));
    it('0.5 with one bound', () => {
      expect(score(40000)).toBe(0.5);
      expect(score(undefined, 40000)).toBe(0.5);
    });
    it('1 with a reasonable range', () => {
      expect(score(40000, 80000)).toBe(1);
    });
    it('0.5 with a very wide range, and says so', () => {
      expect(score(30000, 80000)).toBe(0.5);
      const report = analyzeWithRules(draft({ language: 'en', salary: { min: 30000, max: 80000, currency: 'EUR', period: 'year' } }));
      expect(report.improvements.join(' ')).toMatch(/very wide/);
    });
    it('0.5 when the maximum is below the minimum', () => expect(score(50000, 40000)).toBe(0.5));
  });

  describe('work_mode', () => {
    it('0 without a mode', () => expect(scoreOf(draft(), 'work_mode')).toBe(0));
    it('0.5 with the mode only', () => {
      expect(scoreOf(draft({ workMode: 'remote' }), 'work_mode')).toBe(0.5);
      expect(scoreOf(draft({ workMode: 'hybrid', location: { country: 'IT' } }), 'work_mode')).toBe(0.5);
    });
    it('1 remote with the country', () => expect(scoreOf(draft({ workMode: 'remote', location: { country: 'IT' } }), 'work_mode')).toBe(1));
    it('1 onsite with country, city and days', () =>
      expect(scoreOf(draft({ workMode: 'onsite', location: { country: 'IT', city: 'Roma', onsiteDaysPerWeek: 5 } }), 'work_mode')).toBe(1));
  });

  describe.each([
    ['role_requirements', (items: string[]) => draft({ requirements: { mustHave: items, niceToHave: [] } })],
    ['responsibilities_clarity', (items: string[]) => draft({ responsibilities: items })],
    ['benefits', (items: string[]) => draft({ benefits: items })],
    ['technologies', (items: string[]) => draft({ technologies: items })],
  ] as const)('%s', (category, build) => {
    const concrete: Record<string, string[]> = {
      role_requirements: ['3 anni con Node.js', 'Esperienza con PostgreSQL in produzione', 'Inglese livello B2'],
      responsibilities_clarity: ['Ridurre del 30% i tempi di build', 'Mantenere le API del servizio ordini', 'Partecipare alle code review'],
      benefits: ['Buoni pasto da 8 euro', 'Polizza sanitaria', '25 giorni di ferie'],
      technologies: ['TypeScript', 'PostgreSQL', 'Docker'],
    };
    it('0 when empty', () => expect(scoreOf(build([]), category)).toBe(0));
    it('0.5 with too few items', () => expect(scoreOf(build(['Item uno 1']), category)).toBe(0.5));
    it('0.5 when most items are vague phrases', () =>
      expect(scoreOf(build(['resistenza allo stress', 'ottimi benefit', 'tecnologie moderne', 'attività varie']), category)).toBe(0.5));
    it('1 when concrete', () => expect(scoreOf(build(concrete[category] ?? []), category)).toBe(1));
  });

  it('counts the structured employment terms in the benefits category', () => {
    const employment: Employment = { monthlyPayments: 14, mealVoucher: { amountPerDay: 8, type: 'electronic' }, extraBenefits: ['health_insurance'] };
    expect(scoreOf(draft({ benefits: [], employment }), 'benefits')).toBe(1);
    expect(scoreOf(draft({ benefits: ['Palestra', 'Asilo'], employment: { welfareAnnual: 1000 } }), 'benefits')).toBe(1);
    expect(scoreOf(draft({ benefits: [], employment: { extraBenefits: ['gym', 'phone', 'computer'] } }), 'benefits')).toBe(0.5);
    expect(scoreOf(draft({ benefits: [], employment: { level: '5° livello' } }), 'benefits')).toBe(0);
  });

  it('keeps responsibilities and benefits at 0.5 without measurable elements', () => {
    expect(scoreOf(draft({ responsibilities: ['Mantenere le API', 'Scrivere i test', 'Fare le review'] }), 'responsibilities_clarity')).toBe(0.5);
    expect(scoreOf(draft({ benefits: ['Polizza sanitaria', 'Buoni pasto', 'Palestra'] }), 'benefits')).toBe(0.5);
  });

  it('keeps requirements at 0.5 when items are terse', () => {
    expect(scoreOf(draft({ requirements: { mustHave: ['Go', 'Rust', 'SQL'], niceToHave: [] } }), 'role_requirements')).toBe(0.5);
  });

  describe.each([
    ['growth', 'growth', 'Budget annuo di 1.500 euro per i corsi', 'Si cresce insieme, con tanto impegno e voglia di imparare cose nuove.'],
    ['work_life_balance', 'workLifeBalance', '25 giorni di ferie e 2 giorni di smart working', 'Orari flessibili e massima flessibilità'],
    ['culture', 'culture', 'Feedback 1:1 ogni due settimane e retrospettiva a fine sprint', 'Ambiente giovane e dinamico, come una famiglia'],
  ] as const)('%s', (category, field, concrete, vague) => {
    it('0 when empty', () => expect(scoreOf(draft(), category)).toBe(0));
    it('0.5 when mostly vague phrases', () => expect(scoreOf(draft({ [field]: vague }), category)).toBe(0.5));
    it('0.5 when short and without concrete elements', () => expect(scoreOf(draft({ [field]: 'Ci piace lavorare bene' }), category)).toBe(0.5));
    it('1 with concrete elements', () => expect(scoreOf(draft({ [field]: concrete }), category)).toBe(1));
  });

  it('keeps a concrete text at 1 even when it also holds a vague phrase', () => {
    expect(scoreOf(draft({ culture: 'Ambiente dinamico. Facciamo retrospettiva a fine sprint e feedback 1:1 ogni due settimane, con code review su ogni pull request.' }), 'culture')).toBe(1);
  });

  describe('vague phrases and improvements', () => {
    it('reports vague phrases verbatim with the language of the ad', () => {
      const report = analyzeWithRules(draft({ language: 'en', culture: 'We are LIKE A FAMILY', summary: 'Competitive Salary and possibilità di crescita' }));
      expect(report.vaguePhrases.map((phrase) => phrase.text)).toEqual(['Competitive Salary', 'possibilità di crescita', 'LIKE A FAMILY']);
      expect(report.vaguePhrases[1]?.suggestion).toMatch(/budget/);
      expect(() => adQualityReportSchema.parse(report)).not.toThrow();
    });
    it('writes one improvement per category below 1, in Italian by default and in English on request', () => {
      const it = analyzeWithRules(richAd({ benefits: [], growth: '' }));
      expect(it.improvements).toHaveLength(2);
      expect(it.improvements[0]).toMatch(/benefit/);
      const en = analyzeWithRules(richAd({ language: 'en', benefits: [], growth: '' }));
      expect(en.improvements[0]).toMatch(/List the benefits/);
    });
    it('puts the biggest losses first', () => {
      const report = analyzeWithRules(richAd({ language: 'en', responseDays: undefined, benefits: [] }));
      expect(report.improvements[0]).toMatch(/List the benefits/);
      expect(report.improvements[1]).toMatch(/hear back/);
    });
  });

  it('never mutates its input', () => {
    const content = richAd({ culture: 'Ambiente dinamico, come una famiglia' });
    const before = structuredClone(content);
    analyzeWithRules(content);
    expect(content).toEqual(before);
  });

  it('is deterministic and parses for any minimal content', () => {
    const content = jobContentSchema.parse({ title: 'x' });
    expect(analyzeWithRules(content)).toEqual(analyzeWithRules(content));
  });
});
