/**
 * Privacy by design for every model (the in-app assistant, external agents over MCP): candidate data reaches a model
 * with the first name and the ids only. The surname, contacts and direct identifiers are replaced by these markers.
 * It lowers the risk, it does not make data anonymous (GDPR recital 26): CV content can still single someone out.
 */
import { replacePostalAfterAddress, STREET_DE, STREET_EN, STREET_ES, STREET_FR, STREET_FR_FIRST, STREET_IT, UK_POSTCODE } from './address-patterns.js';
import { ISO_DATE, MONTH_FIRST_DATE, NUMERIC_DATE, WORDED_DATE } from './date-patterns.js';
import { isSpanishId, LABELLED_ID, SPANISH_ID } from './id-patterns.js';
import { replaceSurnameToken, surnamePattern, surnameTokenPattern } from './surname.js';
import { NAME_MARKER, replaceKnownNames, replaceMarkedNames } from './third-party-names.js';

export const REDACTED = {
  surname: '[surname]',
  email: '[email]',
  phone: '[phone]',
  link: '[link]',
  address: '[address]',
  taxCode: '[tax code]',
  iban: '[iban]',
  date: '[date]',
  handle: '[handle]',
  name: NAME_MARKER,
  vat: '[vat number]',
  idNumber: '[id number]',
} as const;

/** What identifies one person beyond the first name: removed wherever it appears. */
export interface PersonIdentifiers {
  readonly lastName: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly linkedinUrl?: string | null;
  /** Full names of other people known to appear (the organization members, for instance): replaced by `[name]`. */
  readonly otherNames?: readonly string[] | null;
}

/** Every quantifier is bounded: the patterns run on text written by strangers and must stay linear. */
const URL = /(?:\bhttps?:\/\/|\bwww\.)[^\s<>"'(),]{0,2000}[^\s<>"'(),.;:!?]/gi;
const PROFILE_TAIL = String.raw`\/[^\s<>"'(),]{0,500}[^\s<>"'(),.;:!?]`;
const PROFILE = new RegExp(
  String.raw`\b(?:[a-z]{2,3}\.)?(?:linkedin|github|gitlab|twitter|x|facebook|instagram|behance|dribbble|medium|stackoverflow|xing|viadeo|malt)\.(?:com|it|org|net|fr|de|es|ch|at|be|co\.uk)` + PROFILE_TAIL,
  'gi',
);
/** Short forms and hosted pages: `t.me/x`, `wa.me/39...`, `name.github.io/page`. */
const SHORT_PROFILE = new RegExp(String.raw`\b(?:t\.me|wa\.me|telegram\.me|lnkd\.in)` + PROFILE_TAIL, 'gi');
const HOSTED_PAGE = /\b[a-z0-9-]{1,39}\.(?:github|gitlab)\.io(?:\/[^\s<>"'(),]{0,500}[^\s<>"'(),.;:!?])?/gi;
/** "LinkedIn: in/mario-rossi": the path of a profile named in words. */
const LINKEDIN_PATH = /\blinkedin[\s:.-]{1,4}in\/[\w%-]{2,100}/gi;
/** A leading `@` and 2-30 handle characters, not after a word, a dot or another `@` (so emails and "a@b" stay out). */
const HANDLE = /(?<![\w@.+-])@[A-Za-z][\w.]{0,28}\w(?![\w@])/g;
/** A personal site without `www`: a personal TLD, or a common one with a path. Lower case, so `ASP.NET` stays. */
const PERSONAL_SITE = new RegExp(
  String.raw`(?<![\w.@/-])[a-z0-9][a-z0-9-]{0,62}\.(?:(?:it|dev|me|page|site|blog|name|eu|fr|ch|nl|pt|co\.uk|co\.[a-z]{2}|com\.[a-z]{2})(?:${PROFILE_TAIL})?|(?:com|net|org|io)${PROFILE_TAIL})(?![\w-])`,
  'g',
);
/** "Skype: live:name", "Discord: name#1234", "skype:name?call": the id after the app name. */
const MESSAGING = /\b(skype|discord|signal|teams)((?:\s?id)?\s?:\s{0,3})(?:live:)?@?[\w.#-]{1,63}\w(?:\?\w{1,20})?/gi;
/** "GitHub: emjdev": a handle after a profile's name, when it looks like one (lower case first, or a digit, `_`, `.`). */
const PROFILE_HANDLE = /\b([Gg]it[Hh]ub|[Gg]it[Ll]ab|[Tt]witter|[Ii]nstagram|[Tt]elegram|[Tt]ik[Tt]ok|[Bb]luesky|[Mm]astodon)(\s?:\s{0,3})@?(?=[a-z\d_]|[A-Za-z]{1,38}[\d_.])[\w.-]{1,38}[\w](?![\w@])/g;
const VAT = /\b((?:P\.?\s?IVA|Partita\s{1,3}IVA|VAT(?:\s?(?:no|n|number)\.?)?)\s?:?\s{0,3})(?:IT\s?)?\d{11}(?!\d)/gi;
const EMAIL = /(?<![\w.+-])[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/gi;
const IBAN_DIGITS_MIN = 10;
/** Omocodia replaces digits by the letters L-V. */
const TAX_CODE = /\b[A-Z]{6}[\dLMNP-V]{2}[A-EHLMPRST][\dLMNP-V]{2}[A-Z][\dLMNP-V]{3}[A-Z]\b/gi;
/** A country code may be followed by a `(0)` trunk prefix and a one-digit area ("+33 6 ...", "+44 (0)20 ..."). */
const PHONE = /(?<![\w+./])(?:(?:\+|00)\d{1,3}[ .-]?(?:\(0\)[ .-]?)?(?:\d[ .-](?=\d{2}))?)?(?:\(\d{2,4}\)[ .-]?)?\d{2,12}(?:[ .-]\d{2,12}){0,4}(?:\s{0,2}(?:int|ext|interno)\.?\s{0,2}\d{1,5})?(?![\w/])/g;

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
const PATTERNS: readonly (readonly [RegExp, (match: string, ...groups: string[]) => string])[] = [
  [URL, () => REDACTED.link],
  [PROFILE, () => REDACTED.link],
  [SHORT_PROFILE, () => REDACTED.link],
  [HOSTED_PAGE, () => REDACTED.link],
  [LINKEDIN_PATH, () => REDACTED.link],
  [PERSONAL_SITE, () => REDACTED.link],
  [EMAIL, () => REDACTED.email],
  [MESSAGING, (_match, app: string, separator: string) => `${app}${separator}${REDACTED.handle}`],
  [HANDLE, () => REDACTED.handle],
  [PROFILE_HANDLE, (_match, site: string, separator: string) => `${site}${separator}${REDACTED.handle}`],
  [VAT, (_match, label: string) => `${label}${REDACTED.vat}`],
  [LABELLED_ID, (_match, label: string) => `${label}${REDACTED.idNumber}`],
  [SPANISH_ID, (match) => (isSpanishId(match) ? REDACTED.idNumber : match)],
  [IBAN, (match) => (match.replace(/\D/g, '').length >= IBAN_DIGITS_MIN ? REDACTED.iban : match)],
  [TAX_CODE, () => REDACTED.taxCode],
  [NUMERIC_DATE, () => REDACTED.date],
  [ISO_DATE, () => REDACTED.date],
  [WORDED_DATE, () => REDACTED.date],
  [MONTH_FIRST_DATE, () => REDACTED.date],
  [STREET_IT, () => REDACTED.address],
  [STREET_EN, () => REDACTED.address],
  [STREET_FR, () => REDACTED.address],
  [STREET_FR_FIRST, () => REDACTED.address],
  [STREET_DE, () => REDACTED.address],
  [STREET_ES, () => REDACTED.address],
  [UK_POSTCODE, () => REDACTED.address],
  [PHONE, replacePhone],
];

const replacePostal = replacePostalAfterAddress(REDACTED.address);

/** Text as a model may read it: first name kept, surname and identifiers replaced by `REDACTED` markers. */
export function pseudonymizeText(text: string, person: PersonIdentifiers): string {
  const known = replaceKnownNames(replaceKnown(text, person), person.otherNames);
  const generic = replacePostal(PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), known));
  const token = surnameTokenPattern(person.lastName);
  const tokens = token ? generic.replace(token, replaceSurnameToken(REDACTED)) : generic;
  const surname = surnamePattern(person.lastName);
  return replaceMarkedNames(surname ? tokens.replace(surname, REDACTED.surname) : tokens);
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
