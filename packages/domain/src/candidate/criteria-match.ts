import type { CvExtraction, ExtractionStatus } from './application.js';
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

/** Experience and location exist only among the extracted fields: a CV read as plain text cannot satisfy them. */
export const needsStructuredCv = (criteria: CandidateCriteria): boolean =>
  criteria.minYearsOfExperience !== undefined || criteria.locations.length > 0;

/**
 * The reference semantics of the criteria search (the Postgres query implements the same): every skill, language and
 * keyword, at least the minimum experience, any one of the locations. A yes or no, never a degree of fit.
 */
export function cvMatchesCriteria(cv: MatchableCv, criteria: CandidateCriteria): boolean {
  if (cv.status !== 'done' && cv.status !== 'text_only') return false;
  const data = cv.status === 'done' ? cv.data : null;
  if (data === null && needsStructuredCv(criteria)) return false;
  const skills = (data?.skills ?? []).map(lower);
  const languages = (data?.languages ?? []).map(lower);
  const location = lower(data?.location ?? '');
  const years = data?.yearsOfExperience;
  return (
    criteria.skills.every((skill) => skills.includes(lower(skill)) || inText(cv, skill)) &&
    criteria.languages.every((language) => languages.some((known) => known.includes(lower(language))) || inText(cv, language)) &&
    criteria.keywords.every((keyword) => inText(cv, keyword)) &&
    (criteria.minYearsOfExperience === undefined || (years !== undefined && years >= criteria.minYearsOfExperience)) &&
    (criteria.locations.length === 0 || criteria.locations.some((place) => location.includes(lower(place))))
  );
}
