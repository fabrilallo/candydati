import { normalizeSkill } from './normalize.js';
import type { SkillEntry } from './types.js';

/** What an organization changes on top of the built-in dictionary. Plain data, as the database keeps it. */
export interface OrganizationSkillAlias {
  /** The skill the alias belongs to: a built-in skill's name, or the organization's own skill. */
  readonly skill: string;
  /** Another way CVs and recruiters write the skill. */
  readonly alias: string;
}

export interface SkillAliasConfig {
  readonly aliases: readonly OrganizationSkillAlias[];
  /** `normalizeSkill` keys of the built-in aliases the organization switched off. */
  readonly disabled: readonly string[];
}

export const NO_SKILL_ALIASES: SkillAliasConfig = { aliases: [], disabled: [] };

/** The dictionary the filter on declared criteria really uses: the built-in one, adjusted by one organization. */
export interface SkillBook {
  readonly entries: readonly SkillEntry[];
  /** The entry a skill, written in any known way, belongs to. */
  entryOf(term: string): SkillEntry | undefined;
  /** Every `normalizeSkill` key a CV skill may have to count as this one; the term itself when the book does not know it. */
  keys(term: string): readonly string[];
  /** The forms to look for as whole words in the free text of a CV, without the ones that are also ordinary words. */
  proseTerms(term: string): readonly string[];
}

const forms = (entry: SkillEntry): readonly string[] => [entry.name, ...entry.aliases];

interface OwnSkill {
  readonly name: string;
  readonly aliases: string[];
}

/** Built-in entries minus the disabled aliases, plus the organization's aliases and skills. */
function resolveEntries(base: readonly SkillEntry[], config: SkillAliasConfig): readonly SkillEntry[] {
  const off = new Set(config.disabled.map(normalizeSkill));
  const baseByKey = new Map(base.flatMap((entry) => forms(entry).map((form) => [normalizeSkill(form), entry] as const)));
  const active = base.map((entry) => ({ ...entry, aliases: entry.aliases.filter((alias) => !off.has(normalizeSkill(alias))) }));
  // The built-in dictionary wins over an alias an organization wrote before the dictionary learnt the same word.
  const taken = new Set(active.flatMap((entry) => forms(entry).map(normalizeSkill)));
  const addedToBase = new Map<string, string[]>();
  const own = new Map<string, OwnSkill>();
  for (const { skill, alias } of config.aliases) {
    const aliasKey = normalizeSkill(alias);
    if (taken.has(aliasKey)) continue;
    const builtIn = baseByKey.get(normalizeSkill(skill));
    if (builtIn !== undefined) {
      addedToBase.set(builtIn.id, [...(addedToBase.get(builtIn.id) ?? []), alias]);
    } else {
      const skillKey = normalizeSkill(skill);
      const group = own.get(skillKey) ?? { name: skill, aliases: [] };
      group.aliases.push(alias);
      if (!own.has(skillKey)) {
        taken.add(skillKey);
        own.set(skillKey, group);
      }
    }
    taken.add(aliasKey);
  }
  return [
    ...active.map((entry) => ({ ...entry, aliases: [...entry.aliases, ...(addedToBase.get(entry.id) ?? [])] })),
    ...[...own].map(([key, group]): SkillEntry => ({ id: `own:${key}`, name: group.name, aliases: group.aliases })),
  ];
}

/** The skill dictionary of one organization. Without a configuration it is the built-in one. */
export function buildSkillBook(base: readonly SkillEntry[], config: SkillAliasConfig = NO_SKILL_ALIASES): SkillBook {
  const entries = resolveEntries(base, config);
  const byKey: ReadonlyMap<string, SkillEntry> = new Map(entries.flatMap((entry) => forms(entry).map((form) => [normalizeSkill(form), entry] as const)));
  const entryOf = (term: string): SkillEntry | undefined => byKey.get(normalizeSkill(term));
  return {
    entries,
    entryOf,
    keys(term) {
      const entry = entryOf(term);
      return entry === undefined ? [normalizeSkill(term)] : [...new Set(forms(entry).map(normalizeSkill))];
    },
    proseTerms(term) {
      const entry = entryOf(term);
      if (entry === undefined) return [term];
      const unsafe = new Set((entry.proseUnsafe ?? []).map(normalizeSkill));
      return forms(entry).filter((form) => !unsafe.has(normalizeSkill(form)));
    },
  };
}
