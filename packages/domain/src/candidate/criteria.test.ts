import { describe, expect, it } from 'vitest';
import { candidateCriteriaSchema, describeCriteria } from './criteria.js';

const issues = (input: unknown): readonly string[] => {
  const result = candidateCriteriaSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('candidateCriteriaSchema', () => {
  it('accepts objective, job-related criteria and normalizes them', () => {
    const criteria = candidateCriteriaSchema.parse({ skills: [' TypeScript ', 'typescript', 'Vue'], languages: ['Inglese'], minYearsOfExperience: 3, locations: ['Milano'] });
    expect(criteria).toEqual({ skills: ['TypeScript', 'Vue'], languages: ['Inglese'], minYearsOfExperience: 3, locations: ['Milano'], keywords: [] });
  });

  it('needs at least one criterion', () => {
    expect(issues({})).toEqual(['criteria_empty']);
    expect(issues({ skills: [] })).toEqual(['criteria_empty']);
  });

  it('has no maximum experience: it would be a limit on age', () => {
    expect(issues({ skills: ['Go'], maxYearsOfExperience: 5 })).not.toEqual([]);
  });

  it.each([
    ['skills', 'max 35 anni'],
    ['keywords', 'giovane'],
    ['keywords', 'donna'],
    ['keywords', 'Male'],
    ['keywords', 'nazionalità italiana'],
    ['keywords', 'married'],
    ['keywords', 'bella presenza'],
    ['keywords', 'no figli'],
    ['locations', 'nato a Milano'],
    ['keywords', 'religione cattolica'],
  ])('refuses %s "%s" as discriminatory', (field, term) => {
    expect(issues({ [field]: [term] })).toContain('criteria_discriminatory');
  });

  it('does not mistake ordinary skills for protected characteristics', () => {
    for (const term of ['Agile', 'Management', 'React Native', 'Data engineering', 'Femtech', 'Manager']) {
      expect(issues({ skills: [term] }), term).toEqual([]);
    }
  });

  it('bounds the number and length of terms', () => {
    expect(issues({ skills: Array.from({ length: 16 }, (_, i) => `s${i}`) })).not.toEqual([]);
    expect(issues({ skills: ['x'.repeat(61)] })).not.toEqual([]);
  });
});

describe('describeCriteria', () => {
  it('lists the criteria in plain words, for the person who confirms them', () => {
    const criteria = candidateCriteriaSchema.parse({ skills: ['Vue'], minYearsOfExperience: 2, locations: ['Milano', 'Torino'] });
    expect(describeCriteria(criteria)).toEqual(['skill: Vue', 'at least 2 years of experience', 'location: Milano or Torino']);
  });
});
