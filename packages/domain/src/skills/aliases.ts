import { z } from 'zod';
import { isDiscriminatory } from '../candidate/criteria.js';
import type { SkillAliasConfig, SkillBook } from './book.js';
import { SKILLS } from './dictionary.js';
import { normalizeSkill } from './normalize.js';

export const SKILL_TERM_MAX = 60;
/** Aliases one organization may add. Disabled built-in aliases do not count. */
export const ORGANIZATION_SKILL_ALIASES_MAX = 500;

/** A skill or an alias: one short written form with at least a letter or a digit, and no protected characteristic. */
const skillTerm = z
  .string()
  .trim()
  .min(1)
  .max(SKILL_TERM_MAX)
  .refine((text) => /[\p{L}\p{N}]/u.test(text), { message: 'skill_term_empty' })
  .refine((text) => !isDiscriminatory(text), { message: 'criteria_discriminatory' });

/** "alias" is another way of writing "skill": a built-in skill's name or alias, or the name of a new skill. */
export const addSkillAliasInputSchema = z.strictObject({ skill: skillTerm, alias: skillTerm });
export type AddSkillAliasInput = z.infer<typeof addSkillAliasInputSchema>;

export const removeSkillAliasInputSchema = z.strictObject({ aliasId: z.string().min(1).max(100) });

/** Switches a built-in alias off or on again. */
export const builtInSkillAliasInputSchema = z.strictObject({ alias: skillTerm });
export type BuiltInSkillAliasInput = z.infer<typeof builtInSkillAliasInputSchema>;

/** The name of the skill an alias will belong to: the built-in or already known skill when there is one, else as typed. */
export const canonicalSkillName = (book: SkillBook, skill: string): string => book.entryOf(skill)?.name ?? skill;

export type SkillAliasIssue = 'alias_redundant' | 'alias_taken';

/**
 * Why `alias` cannot be added to `skill` in this book, or null. An alias belongs to one skill: a word a built-in skill
 * or another alias already uses is `alias_taken`; one the skill already answers to is `alias_redundant`.
 */
export function checkNewSkillAlias(book: SkillBook, skill: string, alias: string): SkillAliasIssue | null {
  if (normalizeSkill(alias) === normalizeSkill(skill)) return 'alias_redundant';
  const owner = book.entryOf(alias);
  if (owner === undefined) return null;
  return owner.id === book.entryOf(skill)?.id ? 'alias_redundant' : 'alias_taken';
}

/** The built-in aliases that can be switched off, by their `normalizeSkill` key: skill names stay. */
export const builtInAliasKeys: ReadonlySet<string> = new Set(SKILLS.flatMap((entry) => entry.aliases.map(normalizeSkill)));

/** Built-in skills that have aliases, each alias with whether it is on for this configuration. */
export function builtInSkillView(config: Pick<SkillAliasConfig, 'disabled'>): readonly { readonly id: string; readonly name: string; readonly aliases: readonly { readonly alias: string; readonly enabled: boolean }[] }[] {
  const off = new Set(config.disabled);
  return SKILLS.filter((entry) => entry.aliases.length > 0).map((entry) => ({
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases.map((alias) => ({ alias, enabled: !off.has(normalizeSkill(alias)) })),
  }));
}
