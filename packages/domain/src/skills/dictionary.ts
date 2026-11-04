import { BUSINESS_SKILLS } from './business.js';
import { DATA_CLOUD_SKILLS } from './data-cloud.js';
import { FRAMEWORK_SKILLS } from './frameworks.js';
import { LANGUAGE_SKILLS } from './languages.js';
import { normalizeSkill } from './normalize.js';
import type { SkillEntry } from './types.js';

export type { SkillEntry } from './types.js';
export { normalizeSkill, SKILL_FOLD_FROM, SKILL_FOLD_TO } from './normalize.js';

/** The whole curated dictionary. */
export const SKILLS: readonly SkillEntry[] = [...LANGUAGE_SKILLS, ...FRAMEWORK_SKILLS, ...DATA_CLOUD_SKILLS, ...BUSINESS_SKILLS];

const forms = (entry: SkillEntry): readonly string[] => [entry.name, ...entry.aliases];

const byKey: ReadonlyMap<string, SkillEntry> = new Map(SKILLS.flatMap((entry) => forms(entry).map((form) => [normalizeSkill(form), entry] as const)));

/** The dictionary entry a skill, written in any known way, belongs to. */
export const skillEntryOf = (term: string): SkillEntry | undefined => byKey.get(normalizeSkill(term));

/**
 * Every comparison key (`normalizeSkill`) a CV skill may have to count as this one: all the spellings of a known
 * skill, or just the term itself when the dictionary does not know it.
 */
export function skillKeys(term: string): readonly string[] {
  const entry = skillEntryOf(term);
  return entry === undefined ? [normalizeSkill(term)] : [...new Set(forms(entry).map(normalizeSkill))];
}

/**
 * The written forms to look for as whole words in the free text of a CV (CVs the extraction could not structure).
 * Forms that are also ordinary words ("Go", "Excel") are left out, so "go" in a sentence is never a skill.
 */
export function skillProseTerms(term: string): readonly string[] {
  const entry = skillEntryOf(term);
  if (entry === undefined) return [term];
  const unsafe = new Set((entry.proseUnsafe ?? []).map(normalizeSkill));
  return forms(entry).filter((form) => !unsafe.has(normalizeSkill(form)));
}
