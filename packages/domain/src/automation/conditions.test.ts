import { describe, expect, it } from 'vitest';
import { automationConditionsSchema, hasConditions, matchesConditions, type ConditionSubject } from './conditions.js';

const subject = (overrides: Partial<ConditionSubject> = {}): ConditionSubject => ({
  source: 'careers_page',
  consentStatus: 'given',
  consentScopes: ['selection'],
  tags: ['senior', 'remote'],
  ...overrides,
});

describe('automationConditionsSchema', () => {
  it('is empty by default and normalizes tags like the candidate profile does', () => {
    expect(automationConditionsSchema.parse({})).toEqual({});
    expect(automationConditionsSchema.parse({ tags: [' Senior ', 'senior'], sources: ['manual', 'manual'] })).toEqual({ tags: ['senior'], sources: ['manual'] });
  });

  it('refuses empty lists, unknown values and unknown keys', () => {
    for (const bad of [{ tags: [] }, { sources: ['linkedin'] }, { consentScopes: ['marketing'] }, { score: 3 }, { tags: [''] }]) {
      expect(automationConditionsSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('matchesConditions', () => {
  it('matches everything without conditions', () => {
    expect(matchesConditions({}, subject())).toBe(true);
    expect(hasConditions({})).toBe(false);
  });

  it('source: one of the listed sources', () => {
    expect(matchesConditions({ sources: ['careers_page', 'manual'] }, subject())).toBe(true);
    expect(matchesConditions({ sources: ['import'] }, subject())).toBe(false);
  });

  it('tags: the candidate has every listed tag', () => {
    expect(matchesConditions({ tags: ['senior'] }, subject())).toBe(true);
    expect(matchesConditions({ tags: ['senior', 'java'] }, subject())).toBe(false);
  });

  it('consent scopes: given through the form for every listed scope (imported data waiting for reconfirmation has none)', () => {
    expect(matchesConditions({ consentScopes: ['selection'] }, subject())).toBe(true);
    expect(matchesConditions({ consentScopes: ['talent_pool'] }, subject())).toBe(false);
    expect(matchesConditions({ consentScopes: ['selection'] }, subject({ consentStatus: 'to_renew' }))).toBe(false);
  });

  it('every condition must hold', () => {
    expect(matchesConditions({ sources: ['careers_page'], tags: ['java'] }, subject())).toBe(false);
    expect(hasConditions({ tags: ['java'] })).toBe(true);
  });
});
