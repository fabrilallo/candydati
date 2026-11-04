/**
 * One skill the filter on declared criteria knows by several names. Data only: to add one, append an entry to the
 * file of its area (see README.md). `normalizeSkill` makes the comparison insensitive to case, spaces, punctuation and
 * diacritics, so "Node.js", "node js" and "NODE-JS" are one spelling and need no alias of their own.
 */
export interface SkillEntry {
  /** Stable lowercase slug, never changed once published. */
  readonly id: string;
  /** How the skill is written in full. */
  readonly name: string;
  /** Other ways CVs and recruiters write it (the name itself is implied). Synonyms only, never a related skill. */
  readonly aliases: readonly string[];
  /**
   * Written forms (the name or an alias) that are also ordinary words ("Go", "Excel", "Spring"): they are matched
   * among the skills a CV lists, never searched as a word in the free text of a CV.
   */
  readonly proseUnsafe?: readonly string[];
}
