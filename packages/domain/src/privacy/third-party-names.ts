/**
 * Names of other people (references, colleagues, organization members) found deterministically, without a model: only
 * where the text itself marks a person (a references section, a title such as "Dott." or "Mme", a phrase such as
 * "reporting to" or "mi jefa", a name right before a contact) or where the name is already known. A full name found in
 * a marked place is removed everywhere else in the text too. A name written in plain prose ("ho lavorato con Mario
 * Bianchi") is not found: that needs a named-entity recognizer (ADR 0010, residual risk).
 */
import { RELATION_PHRASES, TITLES, TITLES_BEFORE_FULL_NAME } from './name-markers.js';

export const NAME_MARKER = '[name]';

/** Every quantifier is bounded: the patterns run on text written by strangers and must stay linear. */
const PART = String.raw`(?:\p{Lu}['’])?\p{Lu}\p{Ll}{1,30}(?:['’]\p{Lu}?\p{Ll}{1,30})?`;
const WORD = String.raw`${PART}(?:-${PART})?`;
const NAME = String.raw`${WORD}(?:[ \t]{1,3}${WORD}){1,3}`;
const FULL_NAME = new RegExp(String.raw`(?<![\p{L}\p{N}'’-])${NAME}(?![\p{L}\p{N}])`, 'gu');
const TITLE = new RegExp(
  String.raw`(?<!\p{L})((?:(?:${TITLES})\.?[ \t]{1,3}){1,2})(${WORD}(?:[ \t]{1,3}${WORD}){0,2})(?![\p{L}\p{N}])`,
  'gu',
);
/** Short titles that are also initials ("M." for Monsieur): only before a first name and a surname. */
const TITLE_FULL = new RegExp(String.raw`(?<!\p{L})((?:${TITLES_BEFORE_FULL_NAME})\.[ \t]{1,3})(${NAME})(?![\p{L}\p{N}])`, 'gu');
const RELATION = new RegExp(
  String.raw`(?<!\p{L})((?:${RELATION_PHRASES})(?:[ \t]{0,3},)?[ \t]{1,3}(?:(?:era|was|war|fue|était|è)[ \t]{1,3})?)(${NAME})(?![\p{L}\p{N}])`,
  'gu',
);
/** A heading, then its lines up to an empty line. */
const REFERENCES =
  /(?<!\p{L})(?:Referenze|References|Referees|Riferimenti|Références|Referenzen|Referencias)(?!\p{L})[^\n]{0,500}(?:\n(?![ \t]{0,20}\n)[^\n]{0,500}){0,20}/giu;
const CONTACT_WORDS = '[Tt]el|[Tt]él|[Cc]ell|[Mm]ob|[Pp]hone|[Ee]-?mail|[Mm]ail|[Hh]andy|[Cc]orreo';
const CONTACT_AFTER = String.raw`[ \t]{0,3}[,;:(\-–][ \t]{0,3}(?:\[email\]|\[phone\]|\[link\]|\[handle\]|(?:${CONTACT_WORDS})(?!\p{L}))`;
const NEAR_CONTACT = new RegExp(String.raw`(?<![\p{L}\p{N}'’-])${NAME}(?=${CONTACT_AFTER})`, 'gu');
const FIRST_NAME_ON_LINE = new RegExp(String.raw`^[^\p{L}\n]{0,10}(${NAME})(?![\p{L}\p{N}])`, 'gmu');

const KNOWN_NAME_MIN = 5;
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word occurrences of `names`, longest first; `flags` decides whether case matters. */
function replaceNames(text: string, names: readonly string[], flags: string): string {
  const words = [...new Set(names.map((name) => name.trim().replace(/\s+/g, ' ')))]
    .filter((name) => name.length >= KNOWN_NAME_MIN)
    .sort((a, b) => b.length - a.length);
  if (words.length === 0) return text;
  const alternatives = words.map((word) => escapeRegExp(word).replace(/ /g, '\\s{1,3}')).join('|');
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, flags), NAME_MARKER);
}

/** Full names already known (the organization members, for instance), as whole words in any case. */
export function replaceKnownNames(text: string, names: readonly string[] | null | undefined): string {
  return replaceNames(text, names ?? [], 'giu');
}

/** The person each line of a references section starts with ("Mario Bianchi, CTO, Acme"). */
const referencedPeople = (text: string): readonly string[] =>
  [...text.matchAll(REFERENCES)].flatMap((section) => [...section[0].matchAll(FIRST_NAME_ON_LINE)].map((match) => match[1] ?? ''));

/** The text with the name after each marker replaced, and the names it replaced. */
const maskAfter = (text: string, pattern: RegExp): readonly [string, readonly string[]] => [
  text.replace(pattern, (_match: string, marker: string) => `${marker}${NAME_MARKER}`),
  [...text.matchAll(pattern)].map((match) => match[2] ?? ''),
];

/**
 * Names the text marks as names: in a references section, after a title or a phrase, right before a contact. A full
 * name found that way is then removed wherever else it appears, written the same way.
 */
export function replaceMarkedNames(text: string): string {
  const people = referencedPeople(text);
  const references = text.replace(REFERENCES, (section) => section.replace(FULL_NAME, NAME_MARKER));
  const [titledFull, fullTitled] = maskAfter(references, TITLE_FULL);
  const [titled, titledNames] = maskAfter(titledFull, TITLE);
  const [related, relatedNames] = maskAfter(titled, RELATION);
  const contactNames = [...related.matchAll(NEAR_CONTACT)].map((match) => match[0]);
  const marked = related.replace(NEAR_CONTACT, NAME_MARKER);
  const found = [...people, ...fullTitled, ...titledNames, ...relatedNames, ...contactNames].filter((name) => name.includes(' '));
  return replaceNames(marked, found, 'gu');
}
