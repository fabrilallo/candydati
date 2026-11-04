/**
 * Names of other people (references, colleagues, organization members) found deterministically, without a model: only
 * where the text itself marks a person (a references section, a title such as "Dott.", a name right before a contact)
 * or where the name is already known. A name written in plain prose ("ho lavorato con Mario") is not found.
 */
export const NAME_MARKER = '[name]';

/** Every quantifier is bounded: the patterns run on text written by strangers and must stay linear. */
const WORD = String.raw`\p{Lu}\p{Ll}{1,30}(?:['’]\p{Lu}?\p{Ll}{1,30})?`;
const FULL_NAME = new RegExp(String.raw`(?<![\p{L}\p{N}])${WORD}(?:[ \t]{1,3}${WORD}){1,3}(?![\p{L}\p{N}])`, 'gu');
const TITLES = String.raw`Dott\.?ssa|Dottoressa|Dottor|Dott|Dr|Ing|Avv|Prof\.?ssa|Prof|Sig\.?ra|Sig|Mrs|Mr|Ms`;
const TITLE = new RegExp(
  String.raw`(?<!\p{L})((?:${TITLES})\.?[ \t]{1,3})${WORD}(?:[ \t]{1,3}${WORD}){0,2}(?![\p{L}\p{N}])`,
  'gu',
);
/** A heading, then its lines up to an empty line. */
const REFERENCES = /(?<!\p{L})(?:Referenze|References|Referees|Riferimenti)(?!\p{L})[^\n]{0,500}(?:\n(?![ \t]{0,20}\n)[^\n]{0,500}){0,20}/giu;
const CONTACT_WORDS = '[Tt]el|[Cc]ell|[Mm]ob|[Pp]hone|[Ee]-?mail|[Mm]ail';
const CONTACT_AFTER = String.raw`[ \t]{0,3}[,;:(\-–][ \t]{0,3}(?:\[email\]|\[phone\]|\[link\]|\[handle\]|(?:${CONTACT_WORDS})(?!\p{L}))`;
const NEAR_CONTACT = new RegExp(String.raw`(?<![\p{L}\p{N}])${WORD}(?:[ \t]{1,3}${WORD}){1,3}(?=${CONTACT_AFTER})`, 'gu');

const KNOWN_NAME_MIN = 5;
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Full names already known (the organization members, for instance), as whole words in any case. */
export function replaceKnownNames(text: string, names: readonly string[] | null | undefined): string {
  const words = [...new Set((names ?? []).map((name) => name.trim().replace(/\s+/g, ' ')))]
    .filter((name) => name.length >= KNOWN_NAME_MIN)
    .sort((a, b) => b.length - a.length);
  if (words.length === 0) return text;
  const alternatives = words.map((word) => escapeRegExp(word).replace(/ /g, '\\s{1,3}')).join('|');
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'giu'), NAME_MARKER);
}

/** Names the text marks as names: in a references section, after a title, right before a contact. */
export function replaceMarkedNames(text: string): string {
  const references = text.replace(REFERENCES, (section) => section.replace(FULL_NAME, NAME_MARKER));
  const titled = references.replace(TITLE, (_match: string, title: string) => `${title}${NAME_MARKER}`);
  return titled.replace(NEAR_CONTACT, NAME_MARKER);
}
