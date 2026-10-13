import { describe, expect, it } from 'vitest';
import { checkPublishable, isPublishable, PUBLISH_RULES, isPublishedContent, jobContentSchema, type JobContentInput } from './content.js';

/** A complete ad that satisfies every rule of PLAN §5.1 (hybrid, so city and onsite days are required). */
const COMPLETE: JobContentInput = {
  title: 'Backend Developer',
  language: 'it',
  role: 'backend_developer',
  seniority: 'senior',
  contractType: 'permanent',
  salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' },
  workMode: 'hybrid',
  location: { country: 'IT', city: 'Milano', onsiteDaysPerWeek: 2 },
  process: [{ type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' }],
  responseDays: 7,
  summary: 'Costruiamo prodotti per le aziende.',
  responsibilities: ['Progettare API', 'Scrivere test', 'Monitorare il servizio'],
  requirements: { mustHave: ['TypeScript'], niceToHave: ['Go'] },
  technologies: ['Node.js', 'PostgreSQL'],
  benefits: ['Buoni pasto'],
  growth: 'Percorso di crescita annuale.',
  workLifeBalance: 'Orario flessibile.',
  culture: 'Feedback continuo.',
};

/** Parses the complete ad with some fields replaced (`undefined` removes a field). */
const draft = (overrides: Record<string, unknown>) => jobContentSchema.parse({ ...COMPLETE, ...overrides });

const rulesOf = (input: Record<string, unknown>) => checkPublishable(draft(input)).map((issue) => `${issue.path}:${issue.rule}`);

describe('checkPublishable', () => {
  it('yields no issues for a complete ad', () => {
    expect(checkPublishable(draft({}))).toEqual([]);
    expect(isPublishable(draft({}))).toBe(true);
  });

  it.each([
    ['role', 'role'],
    ['seniority', 'seniority'],
    ['contractType', 'contractType'],
  ] as const)('reports a missing %s as required', (field) => {
    expect(rulesOf({ [field]: undefined })).toEqual([`${field}:required`]);
  });

  it('reports a missing salary minimum and maximum as required', () => {
    expect(rulesOf({ salary: { max: 60000 } })).toEqual(['salary.min:required']);
    expect(rulesOf({ salary: { min: 45000 } })).toEqual(['salary.max:required']);
  });

  it('reports a maximum below the minimum', () => {
    expect(rulesOf({ salary: { min: 60000, max: 45000 } })).toEqual(['salary.max:salary_max_below_min']);
  });

  it('accepts a maximum equal to the minimum', () => {
    expect(checkPublishable(draft({ salary: { min: 50000, max: 50000 } }))).toEqual([]);
  });

  it('reports a missing work mode', () => {
    expect(rulesOf({ workMode: undefined })).toEqual(['workMode:required']);
  });

  it('reports a missing country', () => {
    expect(rulesOf({ location: { city: 'Milano', onsiteDaysPerWeek: 2 } })).toEqual(['location.country:required']);
  });

  it('reports a missing response time', () => {
    expect(rulesOf({ responseDays: undefined })).toEqual(['responseDays:required']);
  });

  it('reports an empty selection process', () => {
    expect(rulesOf({ process: [] })).toEqual(['process:too_few_stages']);
  });

  it('reports fewer than three responsibilities', () => {
    expect(rulesOf({ responsibilities: ['Solo una'] })).toEqual(['responsibilities:too_few_responsibilities']);
    expect(rulesOf({ responsibilities: [] })).toEqual(['responsibilities:too_few_responsibilities']);
  });

  it('reports the absence of a must-have requirement', () => {
    expect(rulesOf({ requirements: { mustHave: [], niceToHave: ['Go'] } })).toEqual(['requirements.mustHave:too_few_requirements']);
  });

  it('requires a city and onsite days for a hybrid ad', () => {
    expect(rulesOf({ location: { country: 'IT', onsiteDaysPerWeek: 2 } })).toEqual(['location.city:city_required']);
    expect(rulesOf({ location: { country: 'IT', city: 'Milano' } })).toEqual(['location.onsiteDaysPerWeek:onsite_days_required']);
  });

  it('requires a city and onsite days for an onsite ad', () => {
    expect(rulesOf({ workMode: 'onsite', location: { country: 'IT' } })).toEqual([
      'location.city:city_required',
      'location.onsiteDaysPerWeek:onsite_days_required',
    ]);
  });

  it('needs neither a city nor onsite days for a remote ad', () => {
    expect(checkPublishable(draft({ workMode: 'remote', location: { country: 'IT' } }))).toEqual([]);
  });

  it('collects every issue at once instead of stopping at the first', () => {
    const issues = rulesOf({ role: undefined, process: [], responsibilities: [] });
    expect(issues).toEqual(['role:required', 'process:too_few_stages', 'responsibilities:too_few_responsibilities']);
  });
});

describe('isPublishedContent', () => {
  it('narrows a complete ad to the published shape', () => {
    expect(isPublishedContent(draft({}))).toBe(true);
    expect(isPublishedContent(draft({ role: undefined }))).toBe(false);
  });
});

describe('jobContentSchema', () => {
  it('parses a draft with only a title and fills the defaults', () => {
    const content = jobContentSchema.parse({ title: '  Product Designer  ' });
    expect(content.title).toBe('Product Designer');
    expect(content.language).toBe('it');
    expect(content.salary).toEqual({ currency: 'EUR', period: 'year' });
    expect(content.location).toEqual({});
    expect(content.process).toEqual([]);
    expect(content.responsibilities).toEqual([]);
    expect(content.requirements).toEqual({ mustHave: [], niceToHave: [] });
    expect(content.summary).toBe('');
    expect(content.growth).toBe('');
  });

  it('rejects an empty title', () => {
    expect(jobContentSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('rejects over-long strings', () => {
    expect(jobContentSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false);
    expect(jobContentSchema.safeParse({ title: 'ok', summary: 'x'.repeat(4001) }).success).toBe(false);
    expect(jobContentSchema.safeParse({ title: 'ok', responsibilities: ['x'.repeat(301)] }).success).toBe(false);
  });

  it('rejects unknown enum values', () => {
    expect(jobContentSchema.safeParse({ title: 'ok', role: 'wizard' }).success).toBe(false);
    expect(jobContentSchema.safeParse({ title: 'ok', workMode: 'underwater' }).success).toBe(false);
    expect(jobContentSchema.safeParse({ title: 'ok', contractType: 'slavery' }).success).toBe(false);
    expect(jobContentSchema.safeParse({ title: 'ok', language: 'fr' }).success).toBe(false);
  });

  it('rejects a salary that is not a whole positive amount', () => {
    expect(jobContentSchema.safeParse({ title: 'ok', salary: { min: 1000.5 } }).success).toBe(false);
    expect(jobContentSchema.safeParse({ title: 'ok', salary: { min: -1 } }).success).toBe(false);
  });

  it('rejects a country code that is not ISO alpha-2 uppercase', () => {
    expect(jobContentSchema.safeParse({ title: 'ok', location: { country: 'italy' } }).success).toBe(false);
  });

  it('rejects more than the allowed selection stages', () => {
    const stage = { type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' };
    expect(jobContentSchema.safeParse({ title: 'ok', process: Array.from({ length: 11 }, () => stage) }).success).toBe(false);
  });

  it('does not mutate the input', () => {
    const input = { title: '  Data Analyst  ', salary: { min: 30000 }, responsibilities: ['a'] };
    const snapshot = structuredClone(input);
    const parsed = jobContentSchema.parse(input);
    expect(input).toEqual(snapshot);
    expect(parsed).not.toBe(input);
    expect(parsed.responsibilities).not.toBe(input.responsibilities);
  });

  it('turns blocking compliance findings into publish issues with the offending text', () => {
    const issues = checkPublishable(draft({ title: 'Cercasi ragazza per reception', summary: 'Età massima 30 anni.' }));
    expect(issues.map((issue) => `${issue.path}:${issue.rule}`)).toEqual(['title:gender_requirement', 'summary:discriminatory_requirement']);
    expect(issues[0]?.detail?.match).toBe('Cercasi ragazza');
    expect(issues[1]?.detail?.suggestion).toMatch(/età/i);
    expect(isPublishable(draft({ title: 'Sviluppatore Backend' }))).toBe(false);
  });

  it('does not block on compliance warnings', () => {
    expect(checkPublishable(draft({ requirements: { mustHave: ['Neolaureato in informatica'], niceToHave: [] } }))).toEqual([]);
  });

  it('keeps the rule ids of compliance in the public list', () => {
    expect(PUBLISH_RULES).toEqual(expect.arrayContaining(['gender_exclusive_title', 'gender_requirement', 'discriminatory_requirement']));
  });
});
