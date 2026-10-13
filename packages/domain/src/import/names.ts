/** Lowercase, without accents or punctuation, single spaces. "  José-Maria O'Neil " -> "jose maria o neil". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const nameTokens = (value: string): readonly string[] => normalizeText(value).split(' ').filter((token) => token !== '');

/** Order-insensitive key: "Rossi Mario" and "Mario Rossi" give the same one. */
export const nameKey = (value: string): string => nameTokens(value).toSorted().join(' ');

/** Edit distance (insertions, deletions, substitutions) between two strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** 1 for equal strings, 0 for nothing in common: `1 - distance / longest`. */
export function levenshteinRatio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

/** Similarity of two names, ignoring accents, case and the order of the words. */
export const nameSimilarity = (a: string, b: string): number => levenshteinRatio(nameKey(a), nameKey(b));

/** Surname particles: they start the last name ("Maria Grazia De Luca": first "Maria Grazia", last "De Luca"). */
const PARTICLES = new Set(['de', 'di', 'da', 'del', 'della', 'dei', 'degli', 'delle', 'dal', 'dalla', 'dello', 'lo', 'la', 'le', 'van', 'von', 'der', 'den', 'mc', 'mac']);

const isAllCaps = (token: string): boolean => token.length > 1 && token === token.toUpperCase() && token !== token.toLowerCase();

export interface SplitName {
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * Splits a full name written as "Mario Rossi", "ROSSI Mario" or "Maria Grazia De Luca". A single word is a first name
 * with an empty last name: the caller flags it.
 */
export function splitFullName(full: string): SplitName {
  const comma = /^([^,;]+)[,;]\s*([^,;]+)$/.exec(full.trim());
  if (comma) return { firstName: (comma[2] ?? '').trim(), lastName: (comma[1] ?? '').trim() };
  const tokens = full.replace(/[,;]+/g, ' ').split(/\s+/).filter((token) => token !== '');
  if (tokens.length === 0) return { firstName: '', lastName: '' };
  if (tokens.length === 1) return { firstName: tokens[0] ?? '', lastName: '' };
  const [head, ...tail] = tokens;
  if (head !== undefined && isAllCaps(head) && tail.some((token) => !isAllCaps(token))) {
    return { firstName: tail.join(' '), lastName: head };
  }
  const particle = tokens.findIndex((token, index) => index > 0 && PARTICLES.has(token.toLowerCase()));
  if (particle > 0) return { firstName: tokens.slice(0, particle).join(' '), lastName: tokens.slice(particle).join(' ') };
  return { firstName: tokens[0] ?? '', lastName: tokens.slice(1).join(' ') };
}

const FILE_NOISE = new Set(['cv', 'curriculum', 'vitae', 'resume', 'europass', 'candidatura', 'copia', 'def', 'definitivo', 'final', 'aggiornato', 'updated', 'new', 'nuovo', 'it', 'en', 'eng', 'ita']);

/** "Mario_Rossi_CV_2024.pdf" -> "Mario Rossi". Empty when the file name carries no name. */
export function nameFromFileName(fileName: string): string {
  const base = (fileName.split(/[\\/]/).pop() ?? fileName).replace(/\.[a-z0-9]{2,5}$/i, '');
  const words = base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_.\-+()[\]]+/)
    .filter((word) => word !== '' && !/^\d+$/.test(word) && !FILE_NOISE.has(normalizeText(word)));
  return words.join(' ');
}

/** The base name of a path, lowercase and without extension: how a spreadsheet cell and a file are compared. */
export const fileStem = (value: string): string => normalizeText((value.split(/[\\/]/).pop() ?? value).replace(/\.[a-z0-9]{2,5}$/i, ''));

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercase, trimmed, without `mailto:`; null when it is not an email. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').trim().replace(/^mailto:/i, '').replace(/[<>]/g, '').toLowerCase();
  return EMAIL_PATTERN.test(cleaned) ? cleaned : null;
}

/** Digits only, without a 00 prefix or the Italian +39 country code: how two phone numbers are compared. */
export const phoneDigits = (value: string): string => value.replace(/\D+/g, '').replace(/^00/, '').replace(/^39(?=3\d{8,9}$)/, '');
