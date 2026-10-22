import { describe, expect, it } from 'vitest';
import { candidateCriteriaSchema, type CandidateCriteria } from './criteria.js';
import { cvMatchesCriteria, needsStructuredCv, termPattern, type MatchableCv } from './criteria-match.js';

const criteria = (input: unknown): CandidateCriteria => candidateCriteriaSchema.parse(input);
const structured: MatchableCv = {
  status: 'done',
  text: 'Sviluppo con Node.js e C++ da anni. Inglese fluente.',
  data: { skills: ['TypeScript', 'Vue'], languages: ['Inglese C1', 'Spagnolo B2'], yearsOfExperience: 4, location: 'Milano, Italia', experiences: [], education: [] },
};
const textOnly: MatchableCv = { status: 'text_only', text: 'Esperienza con TypeScript e Postgres.', data: null };

describe('cvMatchesCriteria', () => {
  it('matches skills in the structured list (any case) or as whole words in the text', () => {
    expect(cvMatchesCriteria(structured, criteria({ skills: ['typescript', 'node.js', 'C++'] }))).toBe(true);
    expect(cvMatchesCriteria(structured, criteria({ skills: ['Node'] }))).toBe(true);
    expect(cvMatchesCriteria(structured, criteria({ skills: ['Java'] }))).toBe(false);
    expect(cvMatchesCriteria(textOnly, criteria({ skills: ['Postgres', 'typescript'] }))).toBe(true);
    expect(cvMatchesCriteria(textOnly, criteria({ skills: ['Post'] }))).toBe(false);
  });

  it('needs every skill, language and keyword, and any one of the locations', () => {
    expect(cvMatchesCriteria(structured, criteria({ skills: ['Vue', 'Go'] }))).toBe(false);
    expect(cvMatchesCriteria(structured, criteria({ languages: ['inglese', 'spagnolo'] }))).toBe(true);
    expect(cvMatchesCriteria(structured, criteria({ languages: ['tedesco'] }))).toBe(false);
    expect(cvMatchesCriteria(structured, criteria({ locations: ['Roma', 'milano'] }))).toBe(true);
    expect(cvMatchesCriteria(structured, criteria({ locations: ['Roma'] }))).toBe(false);
    expect(cvMatchesCriteria(structured, criteria({ keywords: ['inglese fluente'] }))).toBe(true);
  });

  it('compares experience as a minimum and only on structured CVs', () => {
    expect(cvMatchesCriteria(structured, criteria({ minYearsOfExperience: 4 }))).toBe(true);
    expect(cvMatchesCriteria(structured, criteria({ minYearsOfExperience: 5 }))).toBe(false);
    expect(cvMatchesCriteria(textOnly, criteria({ minYearsOfExperience: 0 }))).toBe(false);
    expect(cvMatchesCriteria(textOnly, criteria({ locations: ['Milano'] }))).toBe(false);
  });

  it('never matches a CV that was not read', () => {
    expect(cvMatchesCriteria({ status: 'failed', text: 'TypeScript', data: null }, criteria({ skills: ['TypeScript'] }))).toBe(false);
    expect(cvMatchesCriteria({ status: 'pending', text: null, data: null }, criteria({ skills: ['TypeScript'] }))).toBe(false);
  });
});

describe('needsStructuredCv', () => {
  it('is true when a criterion can be checked only on extracted fields', () => {
    expect(needsStructuredCv(criteria({ skills: ['Vue'], keywords: ['x'] }))).toBe(false);
    expect(needsStructuredCv(criteria({ minYearsOfExperience: 1 }))).toBe(true);
    expect(needsStructuredCv(criteria({ locations: ['Milano'] }))).toBe(true);
  });
});

describe('termPattern', () => {
  it('escapes the term and requires word boundaries, in a syntax Postgres and JavaScript share', () => {
    expect(termPattern('C++')).toBe('(^|[^[:alnum:]_])C\\+\\+($|[^[:alnum:]_])');
  });
});
