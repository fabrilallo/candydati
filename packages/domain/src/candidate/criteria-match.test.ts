import { describe, expect, it } from 'vitest';
import { candidateCriteriaSchema, type CandidateCriteria } from './criteria.js';
import { skillBookOf } from '../skills/dictionary.js';
import { cvMatchesCriteria, needsStructuredCv, skillMatchesOf, termPattern, type MatchableCv } from './criteria-match.js';

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

  it('knows synonyms: a skill matches under any of its names, both ways', () => {
    const cv = (skills: string[], text: string | null = null): MatchableCv => ({ ...structured, text, data: { ...structured.data!, skills } });
    expect(cvMatchesCriteria(cv(['Golang']), criteria({ skills: ['Go'] }))).toBe(true);
    expect(cvMatchesCriteria(cv(['Go']), criteria({ skills: ['golang'] }))).toBe(true);
    expect(cvMatchesCriteria(cv(['JS']), criteria({ skills: ['JavaScript'] }))).toBe(true);
    expect(cvMatchesCriteria(cv(['K8s']), criteria({ skills: ['Kubernetes'] }))).toBe(true);
    expect(cvMatchesCriteria(cv(['PostgreSQL']), criteria({ skills: ['Postgres'] }))).toBe(true);
    expect(cvMatchesCriteria(cv(['Node']), criteria({ skills: ['Node.js'] }))).toBe(true);
    expect(cvMatchesCriteria(cv(['csharp']), criteria({ skills: ['C#'] }))).toBe(true);
    expect(cvMatchesCriteria(cv(['React.js']), criteria({ skills: ['react'] }))).toBe(true);
    expect(cvMatchesCriteria(cv(['Contabilita']), criteria({ skills: ['Contabilità'] }))).toBe(true);
  });

  it('keeps C, C++ and C# apart and still matches an unknown skill exactly', () => {
    const cv = (skills: string[]): MatchableCv => ({ ...structured, text: null, data: { ...structured.data!, skills } });
    expect(cvMatchesCriteria(cv(['C++']), criteria({ skills: ['C'] }))).toBe(false);
    expect(cvMatchesCriteria(cv(['C#']), criteria({ skills: ['C++'] }))).toBe(false);
    expect(cvMatchesCriteria(cv(['Zig']), criteria({ skills: ['zig'] }))).toBe(true);
    expect(cvMatchesCriteria(cv(['Zigg']), criteria({ skills: ['zig'] }))).toBe(false);
  });

  it('does not read the English word "go" in free text as the skill Go', () => {
    const prose: MatchableCv = { status: 'text_only', text: 'Ready to go the extra mile. Excel at teamwork.', data: null };
    expect(cvMatchesCriteria(prose, criteria({ skills: ['Go'] }))).toBe(false);
    expect(cvMatchesCriteria(prose, criteria({ skills: ['Excel'] }))).toBe(false);
    expect(cvMatchesCriteria({ ...prose, text: 'Backend in Golang e Kubernetes.' }, criteria({ skills: ['Go'] }))).toBe(true);
    expect(cvMatchesCriteria({ ...prose, text: 'Deploy su k8s.' }, criteria({ skills: ['Kubernetes'] }))).toBe(true);
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

function textOnlyWith(text: string): MatchableCv {
  return { status: 'text_only', text, data: null };
}

describe('the skills of an organization', () => {
  const cv = (skills: string[], text: string | null = null): MatchableCv => ({ ...structured, text, data: { ...structured.data!, skills } });
  const book = skillBookOf({ aliases: [{ skill: 'Go', alias: 'Gopher' }, { skill: 'Figma', alias: 'Figjam' }], disabled: ['k8s'] });

  it('matches under the organization aliases, and only for that organization', () => {
    expect(cvMatchesCriteria(cv(['Gopher']), criteria({ skills: ['Go'] }), book)).toBe(true);
    expect(cvMatchesCriteria(cv(['Gopher']), criteria({ skills: ['Go'] }))).toBe(false);
    expect(cvMatchesCriteria(cv(['Figjam']), criteria({ skills: ['figma'] }), book)).toBe(true);
  });

  it('stops matching a built-in alias the organization disabled', () => {
    expect(cvMatchesCriteria(cv(['K8s']), criteria({ skills: ['Kubernetes'] }), book)).toBe(false);
    expect(cvMatchesCriteria(cv(['K8s']), criteria({ skills: ['Kubernetes'] }))).toBe(true);
    expect(cvMatchesCriteria(textOnlyWith('Deploy su k8s.'), criteria({ skills: ['Kubernetes'] }), book)).toBe(false);
  });

  it('says which spelling met a criterion, and nothing for the spelling that was asked for', () => {
    expect(skillMatchesOf(cv(['Golang', 'Gopher']), criteria({ skills: ['Go', 'Vue'] }), book)).toEqual([{ criterion: 'Go', matchedAs: 'Golang' }]);
    expect(skillMatchesOf(cv(['Go', 'Golang']), criteria({ skills: ['Go'] }), book)).toEqual([]);
    expect(skillMatchesOf(cv([]), criteria({ skills: ['Go'] }), book)).toEqual([]);
    expect(skillMatchesOf(textOnlyWith('Backend in Golang.'), criteria({ skills: ['Go'] }), book)).toEqual([{ criterion: 'Go', matchedAs: 'golang' }]);
  });
});

describe('termPattern', () => {
  it('escapes the term and requires word boundaries, in a syntax Postgres and JavaScript share', () => {
    expect(termPattern('C++')).toBe('(^|[^[:alnum:]_])C\\+\\+($|[^[:alnum:]_])');
  });
});
