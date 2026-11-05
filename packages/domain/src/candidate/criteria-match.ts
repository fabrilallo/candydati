import type { CvExtraction, ExtractionStatus } from './application.js';
import { DEFAULT_SKILL_BOOK, normalizeSkill, type SkillBook } from '../skills/dictionary.js';
import type { CandidateCriteria } from './criteria.js';

/** What the criteria are checked against: one CV as extracted. */
export interface MatchableCv {
  readonly status: ExtractionStatus;
  readonly text: string | null;
  readonly data: CvExtraction | null;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The term as a whole word, case-insensitive, for Postgres (`~*`, where it runs in production) and for the in-memory
 * twin. The POSIX class is rewritten for JavaScript by `jsPattern`.
 */
export const termPattern = (term: string): string => `(^|[^[:alnum:]_])${escapeRegExp(term)}($|[^[:alnum:]_])`;

const jsPattern = (term: string): RegExp => new RegExp(termPattern(term).replaceAll('[:alnum:]', '\\p{L}\\p{N}'), 'iu');

const inText = (cv: MatchableCv, term: string): boolean => cv.text !== null && jsPattern(term).test(cv.text);
const lower = (text: string): string => text.toLowerCase();

/** A skill criterion that was met under another written form: the criterion as declared, and what the CV says. */
export interface SkillMatch {
  readonly criterion: string;
  readonly matchedAs: string;
}

/**
 * How a skill criterion is met, as the form that met it: a skill the CV lists under any of its known names (`skills/`),
 * or, for a CV the extraction left as plain text, a whole word of the text that is not an ordinary word ("go" in a
 * sentence). Null when the CV does not have the skill.
 */
function skillForm(cv: MatchableCv, listed: readonly string[], skill: string, book: SkillBook): string | null {
  const keys = new Set(book.keys(skill));
  const asked = normalizeSkill(skill);
  // The spelling that was asked for, when the CV has it, is the match: no note about another name.
  const found = listed.find((own) => normalizeSkill(own) === asked) ?? listed.find((own) => keys.has(normalizeSkill(own)));
  if (found !== undefined) return found;
  return book.proseTerms(skill).find((term) => inText(cv, term)) ?? null;
}

const listedSkills = (cv: MatchableCv): readonly string[] => (cv.status === 'done' ? (cv.data?.skills ?? []) : []);

/** Experience and location exist only among the extracted fields: a CV read as plain text cannot satisfy them. */
export const needsStructuredCv = (criteria: CandidateCriteria): boolean =>
  criteria.minYearsOfExperience !== undefined || criteria.locations.length > 0;

/**
 * The reference semantics of the criteria search (the Postgres query implements the same): every skill (under any of its names), language and
 * keyword, at least the minimum experience, any one of the locations. A yes or no, never a degree of fit.
 */
export function cvMatchesCriteria(cv: MatchableCv, criteria: CandidateCriteria, book: SkillBook = DEFAULT_SKILL_BOOK): boolean {
  if (cv.status !== 'done' && cv.status !== 'text_only') return false;
  const data = cv.status === 'done' ? cv.data : null;
  if (data === null && needsStructuredCv(criteria)) return false;
  const skills = listedSkills(cv);
  const languages = (data?.languages ?? []).map(lower);
  const location = lower(data?.location ?? '');
  const years = data?.yearsOfExperience;
  return (
    criteria.skills.every((skill) => skillForm(cv, skills, skill, book) !== null) &&
    criteria.languages.every((language) => languages.some((known) => known.includes(lower(language))) || inText(cv, language)) &&
    criteria.keywords.every((keyword) => inText(cv, keyword)) &&
    (criteria.minYearsOfExperience === undefined || (years !== undefined && years >= criteria.minYearsOfExperience)) &&
    (criteria.locations.length === 0 || criteria.locations.some((place) => location.includes(lower(place))))
  );
}

/**
 * For each skill criterion the CV met under another spelling than the one declared, which spelling: "Go" met by
 * "Golang". Informative only (a person sees why the CV is in the list); it never orders or weighs anything.
 */
export function skillMatchesOf(cv: MatchableCv, criteria: CandidateCriteria, book: SkillBook = DEFAULT_SKILL_BOOK): readonly SkillMatch[] {
  const listed = listedSkills(cv);
  return criteria.skills.flatMap((criterion) => {
    const form = skillForm(cv, listed, criterion, book);
    return form === null || normalizeSkill(form) === normalizeSkill(criterion) ? [] : [{ criterion, matchedAs: form.trim().slice(0, 60) }];
  });
}
