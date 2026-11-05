import type { SkillAliasConfig } from '@candydati/domain';
import type { CoreDeps } from './ports.js';

/** An alias the organization added: `alias` is another way of writing `skill`. */
export interface SkillAliasRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly skill: string;
  readonly alias: string;
  /** `normalizeSkill(alias)`: unique per organization. */
  readonly aliasKey: string;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface OrganizationSkillAliases {
  /** Oldest first. */
  readonly aliases: readonly SkillAliasRecord[];
  /** `normalizeSkill` keys of the built-in aliases switched off. */
  readonly disabled: readonly string[];
}

/** Every method takes the organization. */
export interface SkillAliasRepository {
  load(organizationId: string): Promise<OrganizationSkillAliases>;
  /** @throws ConflictError (`alias_taken`) when the organization already has this alias key. */
  add(record: SkillAliasRecord): Promise<SkillAliasRecord>;
  /** The removed alias, or null when there is no such alias in the organization. */
  remove(organizationId: string, id: string): Promise<SkillAliasRecord | null>;
  /** True when the alias was on and is now off. */
  disable(organizationId: string, aliasKey: string, by: string, at: Date): Promise<boolean>;
  /** True when the alias was off and is now on. */
  enable(organizationId: string, aliasKey: string): Promise<boolean>;
}

export const toSkillAliasConfig = (loaded: OrganizationSkillAliases): SkillAliasConfig => ({
  aliases: loaded.aliases.map(({ skill, alias }) => ({ skill, alias })),
  disabled: loaded.disabled,
});

export interface SkillAliasDeps extends CoreDeps {
  readonly skillAliases: SkillAliasRepository;
  readonly newId: () => string;
  readonly now: () => Date;
}
