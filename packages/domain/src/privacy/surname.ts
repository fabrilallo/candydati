/** The candidate's surname as the text may write it: in any case, without accents, transliterated, inside a site. */

/** Particles are shared by many surnames and are ordinary words: only the full surname removes them. */
const PARTICLES = new Set(['da', 'de', 'di', 'del', 'della', 'dei', 'degli', 'delle', 'dal', 'dalla', 'lo', 'la', 'le', 'li', 'van', 'von', 'der', 'den', 'dos', 'das', 'du', 'mac', 'san', 'santa', 'santo', 'y']);
const SURNAME_PART_MIN = 3;
/** Shorter parts are too likely inside unrelated handles and domains. */
const TOKEN_PART_MIN = 4;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GERMAN = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' } as const;

/** The word, then without diacritics ("García" -> "Garcia"), then transliterated ("Müller" -> "Mueller"). */
const spellings = (word: string): readonly string[] => {
  const lower = word.toLowerCase();
  const plain = lower.normalize('NFD').replace(/\p{M}/gu, '');
  const transliterated = lower.replace(/[äöüß]/g, (letter) => GERMAN[letter as keyof typeof GERMAN]);
  return [...new Set([lower, plain, transliterated])];
};

const distinctive = (full: string, min: number): readonly string[] =>
  full.split(/[\s'’-]+/).filter((part) => part.length >= min && !PARTICLES.has(part.toLowerCase()));

const alternation = (words: readonly string[]): string =>
  [...new Set(words.flatMap(spellings))]
    .filter((word) => word.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((word) => escapeRegExp(word).replace(/ /g, '\\s{1,3}'))
    .join('|');

const normalize = (lastName: string): string => lastName.trim().replace(/\s+/g, ' ');

/** The full surname, then each distinctive part of it, as whole words in any case and spelling. */
export function surnamePattern(lastName: string): RegExp | null {
  const full = normalize(lastName);
  if (full === '') return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation([full, ...distinctive(full, SURNAME_PART_MIN)])})(?![\\p{L}\\p{N}])`, 'giu');
}

const TOKEN_CHARS = String.raw`[\p{L}\p{N}._-]`;

/**
 * A token glued to the surname by a dot, an underscore, a digit or other letters ("emilyjohnson.io", "ejohnson_92"):
 * a site or a handle. Plain words that contain the surname ("Johnsonville") are not tokens of this kind.
 */
export function surnameTokenPattern(lastName: string): RegExp | null {
  const full = normalize(lastName);
  const words = [full.replace(/[\s'’-]/g, ''), ...distinctive(full, TOKEN_PART_MIN)].filter((word) => word.length >= TOKEN_PART_MIN);
  if (words.length === 0) return null;
  return new RegExp(`(?<!${TOKEN_CHARS})${TOKEN_CHARS}{0,40}(?:${alternation(words)})${TOKEN_CHARS}{0,40}(?!${TOKEN_CHARS})`, 'giu');
}

const SITE = /\.[a-z]{2,}$/i;
const GLUE = /[._\d]/;

/** `[link]` for a site, `[handle]` for a glued handle; anything else (a plain word, the bare surname) unchanged. */
export const replaceSurnameToken =
  (markers: { readonly link: string; readonly handle: string }) =>
  (token: string): string => {
    const trailing = /[._-]+$/.exec(token)?.[0] ?? '';
    const core = token.slice(0, token.length - trailing.length);
    if (!GLUE.test(core)) return token;
    return `${SITE.test(core) ? markers.link : markers.handle}${trailing}`;
  };
