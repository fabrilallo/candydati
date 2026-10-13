/**
 * Case- and accent-insensitive folding that keeps the string length: index `i` of the folded text is index `i`
 * of the original, so a match can be reported exactly as written in the ad.
 */
const foldChar = (char: string): string => {
  if (char === '’' || char === '‘') return "'";
  const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return folded.length === char.length ? folded : char;
};

export const fold = (text: string): string => Array.from(text, foldChar).join('');

export const isWordChar = (char: string | undefined): boolean => char !== undefined && /[\p{L}\p{N}]/u.test(char);

export const hasNumber = (text: string): boolean => /\d/.test(text);

export const wordCount = (text: string): number => text.split(/\s+/).filter((word) => word.length > 0).length;
