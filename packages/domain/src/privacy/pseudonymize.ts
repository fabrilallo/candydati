/**
 * Privacy by design for every model (the in-app assistant, external agents over MCP): candidate data reaches a model
 * with the first name and the ids only. The surname, contacts and direct identifiers are replaced by these markers.
 * It lowers the risk, it does not make data anonymous (GDPR recital 26): CV content can still single someone out.
 */
export const REDACTED = {
  surname: '[surname]',
  email: '[email]',
  phone: '[phone]',
  link: '[link]',
  address: '[address]',
  taxCode: '[tax code]',
  iban: '[iban]',
  date: '[date]',
} as const;

/** What identifies one person beyond the first name: removed wherever it appears. */
export interface PersonIdentifiers {
  readonly lastName: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly linkedinUrl?: string | null;
}

/** Every quantifier is bounded: the patterns run on text written by strangers and must stay linear. */
const URL = /(?:\bhttps?:\/\/|\bwww\.)[^\s<>"'(),]{0,2000}[^\s<>"'(),.;:!?]/gi;
const PROFILE = /\b(?:linkedin|github|gitlab|twitter|x|facebook|instagram|behance|dribbble|medium|stackoverflow)\.com\/[^\s<>"'(),]{0,500}[^\s<>"'(),.;:!?]/gi;
const EMAIL = /(?<![\w.+-])[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;
const TAX_CODE = /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/gi;
const NUMERIC_DATE = /(?<!\d)\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}(?!\d)/g;
const MONTHS = 'gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|may|jun|jul|aug|sep|oct|dec';
const WORDED_DATE = new RegExp(`(?<![\\p{L}\\d])\\d{1,2}\\s{1,3}(?:${MONTHS})\\p{L}{0,8}\\.?\\s{1,3}(?:19|20)\\d{2}(?!\\d)`, 'giu');
const STREET_IT =
  /\b(?:Via|Viale|Piazza|Piazzale|Corso|Largo|Vicolo|Strada|Contrada|Borgo)(?:\s{1,3}(?:\p{Lu}[\p{L}'.]{0,30}|d[aei]|del|della|dei|degli|delle)){1,5},?\s{1,3}\d{1,3}[a-zA-Z]?(?![\d\p{L}])/gu;
const STREET_EN = /(?<!\d)\d{1,5}\s{1,3}(?:\p{Lu}\p{L}{0,30}\s{1,3}){1,3}(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Drive|Boulevard)(?!\p{L})/gu;
const PHONE = /(?<![\w+./])(?:(?:\+|00)\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d{2,12}(?:[ .-]\d{2,12}){0,4}(?![\w/])/g;

const PHONE_DIGITS_MIN = 9;
const PHONE_DIGITS_MAX = 15;
const YEAR = /^(?:19|20)\d{2}$/;

/** A run of digits is a phone number when it has a phone's length and is not a list of years ("2018-2021 2022"). */
const replacePhone = (match: string): string => {
  const digits = match.replace(/\D/g, '');
  const groups = match.split(/[^\d]+/).filter((group) => group !== '');
  const years = groups.every((group) => YEAR.test(group));
  return digits.length >= PHONE_DIGITS_MIN && digits.length <= PHONE_DIGITS_MAX && !years ? REDACTED.phone : match;
};

/** Particles are shared by many surnames and are ordinary words: only the full surname removes them. */
const PARTICLES = new Set(['da', 'de', 'di', 'del', 'della', 'dei', 'degli', 'delle', 'dal', 'dalla', 'lo', 'la', 'le', 'li', 'van', 'von', 'der', 'den', 'dos', 'das', 'du', 'mac', 'san', 'santa', 'santo']);
const SURNAME_PART_MIN = 3;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The full surname, then each distinctive part of it, as whole words in any case. */
function surnamePattern(lastName: string): RegExp | null {
  const full = lastName.trim().replace(/\s+/g, ' ');
  const parts = full.split(/[\s'’-]+/).filter((part) => part.length >= SURNAME_PART_MIN && !PARTICLES.has(part.toLowerCase()));
  const words = [...new Set([full, ...parts])].filter((word) => word.length > 0).sort((a, b) => b.length - a.length);
  if (words.length === 0) return null;
  const alternatives = words.map((word) => escapeRegExp(word).replace(/ /g, '\\s{1,3}')).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'giu');
}

const KNOWN_VALUE_MIN = 5;

/** The person's own contacts, as stored: caught even when written in a way the patterns would miss. */
function replaceKnown(text: string, person: PersonIdentifiers): string {
  const known: readonly (readonly [string | null | undefined, string])[] = [
    [person.linkedinUrl, REDACTED.link],
    [person.email, REDACTED.email],
    [person.phone, REDACTED.phone],
  ];
  return known.reduce((current, [value, marker]) => (value && value.length >= KNOWN_VALUE_MIN ? current.split(value).join(marker) : current), text);
}

/** Links and emails first: they often carry the surname, and must disappear whole. */
const PATTERNS: readonly (readonly [RegExp, (match: string) => string])[] = [
  [URL, () => REDACTED.link],
  [PROFILE, () => REDACTED.link],
  [EMAIL, () => REDACTED.email],
  [IBAN, () => REDACTED.iban],
  [TAX_CODE, () => REDACTED.taxCode],
  [NUMERIC_DATE, () => REDACTED.date],
  [WORDED_DATE, () => REDACTED.date],
  [STREET_IT, () => REDACTED.address],
  [STREET_EN, () => REDACTED.address],
  [PHONE, replacePhone],
];

/** Text as a model may read it: first name kept, surname and identifiers replaced by `REDACTED` markers. */
export function pseudonymizeText(text: string, person: PersonIdentifiers): string {
  const known = replaceKnown(text, person);
  const generic = PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), known);
  const surname = surnamePattern(person.lastName);
  return surname ? generic.replace(surname, REDACTED.surname) : generic;
}

/** Every string of a JSON-like value (CV fields, message lists) through `pseudonymizeText`; returns a new value. */
export function pseudonymizeValue<T>(value: T, person: PersonIdentifiers): T {
  if (typeof value === 'string') return pseudonymizeText(value, person) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => pseudonymizeValue(item, person)) as T;
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, pseudonymizeValue(item, person)])) as T;
  }
  return value;
}
