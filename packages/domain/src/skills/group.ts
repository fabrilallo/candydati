import type { SkillBook } from './book.js';
import { normalizeSkill } from './normalize.js';

/** One skill of a CV as the organization's dictionary reads it. */
export interface GroupedSkill {
  /** The dictionary's name for the skill; null when the organization's dictionary does not know it. */
  readonly canonical: string | null;
  /** Every distinct way the CV wrote it, in order of first appearance. */
  readonly writtenAs: readonly string[];
}

/**
 * The skills extracted from a CV, with the ones that are the same skill under different names ("Go" and "Golang")
 * merged. Read-time only: nothing is stored or rewritten, so an alias change shows up at once. Order of first
 * appearance, never of merit. A skill the book does not know is grouped only with its own spellings.
 */
export function groupExtractedSkills(book: SkillBook, skills: readonly string[]): readonly GroupedSkill[] {
  const groups = new Map<string, { canonical: string | null; writtenAs: string[] }>();
  for (const skill of skills) {
    const entry = book.entryOf(skill);
    const key = entry === undefined ? `key:${normalizeSkill(skill)}` : `entry:${entry.id}`;
    const group = groups.get(key) ?? { canonical: entry?.name ?? null, writtenAs: [] };
    if (!group.writtenAs.includes(skill)) group.writtenAs.push(skill);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ canonical: group.canonical, writtenAs: [...group.writtenAs] }));
}
