import { cvExtractionSchema, type CvExtraction } from '@candydati/domain';

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /\bnat[oa]\s+(il|a|in|nel)\b/i,
  /\bdata\s+di\s+nascita\b/i,
  /\bborn\s+(on|in)\b/i,
  /\b(date\s+of\s+birth|birth\s?date|birthday|d\.?o\.?b\.?)\b/i,
  /\bet[àa]\s*:?\s*\d{1,2}\b/i,
  /\b(age|aged)\s*:?\s*\d{1,2}\b/i,
  /\b\d{1,2}\s*(years?\s+old|y\/o|yo)\b/i,
  /\b\d{2}\s*anni\b(?!\s+di\b)/i,
];

export const looksSensitive = (value: string): boolean => SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));

const clean = (value: string | undefined): string | undefined => (value !== undefined && looksSensitive(value) ? undefined : value);

function cleanObject<T extends Record<string, unknown>>(entry: T): T {
  return Object.fromEntries(
    Object.entries(entry).map(([key, value]) => [key, typeof value === 'string' ? clean(value) : value]),
  ) as T;
}

/** Second guard after the model: drops string fields that look like birth date or age. Returns a new object. */
export function dropBirthAndAge(data: CvExtraction): CvExtraction {
  const candidate = {
    ...cleanObject(data),
    experiences: data.experiences.map(cleanObject).filter((entry) => entry.title !== undefined),
    education: data.education.map(cleanObject).filter((entry) => entry.title !== undefined),
    skills: data.skills.filter((skill) => !looksSensitive(skill)),
    languages: data.languages.filter((language) => !looksSensitive(language)),
  };
  return cvExtractionSchema.parse(candidate);
}
