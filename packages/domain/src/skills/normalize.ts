/** Letters Postgres folds with `translate` in the criteria search: the same set, so both sides agree. */
export const SKILL_FOLD_FROM = 'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ';
export const SKILL_FOLD_TO = 'aaaaaaeeeeiiiioooooouuuuyycn';

/**
 * The comparison key of a skill as written: lower case, no diacritics, and only letters, digits, `+` and `#` kept, so
 * "C++", "C#" and "C" stay distinct while "Node.js", "node js" and "NODE-JS" collapse to one key. A text with nothing
 * to keep (only symbols) keeps its trimmed lower-case form.
 */
export function normalizeSkill(text: string): string {
  const folded = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const key = folded.replace(/[^\p{L}\p{N}+#]/gu, '');
  return key === '' ? folded.trim() : key;
}
