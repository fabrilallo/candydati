import { BUSINESS_SKILLS } from './business.js';
import { buildSkillBook, type SkillAliasConfig, type SkillBook } from './book.js';
import { DATA_CLOUD_SKILLS } from './data-cloud.js';
import { FRAMEWORK_SKILLS } from './frameworks.js';
import { LANGUAGE_SKILLS } from './languages.js';
import type { SkillEntry } from './types.js';

export type { SkillEntry } from './types.js';
export * from './book.js';
export { normalizeSkill, SKILL_FOLD_FROM, SKILL_FOLD_TO } from './normalize.js';

/** The whole curated dictionary. */
export const SKILLS: readonly SkillEntry[] = [...LANGUAGE_SKILLS, ...FRAMEWORK_SKILLS, ...DATA_CLOUD_SKILLS, ...BUSINESS_SKILLS];

/** The dictionary as shipped, without any organization's changes. */
export const DEFAULT_SKILL_BOOK: SkillBook = buildSkillBook(SKILLS);

/** The book of an organization: the shipped dictionary plus its own aliases, minus the ones it switched off. */
export const skillBookOf = (config: SkillAliasConfig): SkillBook => buildSkillBook(SKILLS, config);

/** The dictionary entry a skill, written in any known way, belongs to. */
export const skillEntryOf = (term: string, book: SkillBook = DEFAULT_SKILL_BOOK): SkillEntry | undefined => book.entryOf(term);

/**
 * Every comparison key (`normalizeSkill`) a CV skill may have to count as this one: all the spellings of a known
 * skill, or just the term itself when the dictionary does not know it.
 */
export const skillKeys = (term: string, book: SkillBook = DEFAULT_SKILL_BOOK): readonly string[] => book.keys(term);

/**
 * The written forms to look for as whole words in the free text of a CV (CVs the extraction could not structure).
 * Forms that are also ordinary words ("Go", "Excel") are left out, so "go" in a sentence is never a skill.
 */
export const skillProseTerms = (term: string, book: SkillBook = DEFAULT_SKILL_BOOK): readonly string[] => book.proseTerms(term);
