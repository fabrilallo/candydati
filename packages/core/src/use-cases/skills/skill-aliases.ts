import {
  addSkillAliasInputSchema,
  builtInAliasKeys,
  builtInSkillAliasInputSchema,
  canonicalSkillName,
  checkNewSkillAlias,
  normalizeSkill,
  ORGANIZATION_SKILL_ALIASES_MAX,
  removeSkillAliasInputSchema,
  skillBookOf,
  type SkillBook,
} from '@candydati/domain';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../../errors.js';
import { toSkillAliasConfig, type OrganizationSkillAliases, type SkillAliasDeps, type SkillAliasRecord, type SkillAliasRepository } from '../../skill-alias-ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

const defineSkillAliasUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<SkillAliasDeps, S, O>): UseCase<SkillAliasDeps, O> =>
  defineUseCase<SkillAliasDeps, S, O>(definition);

/** What an organization changed on top of the built-in dictionary. */
export type SkillAliasOverview = OrganizationSkillAliases;

/** The skill dictionary of one organization: the built-in one with its own aliases. What every criteria search uses. */
export async function loadSkillBook(deps: { readonly skillAliases: Pick<SkillAliasRepository, 'load'> }, organizationId: string): Promise<SkillBook> {
  return skillBookOf(toSkillAliasConfig(await deps.skillAliases.load(organizationId)));
}

const aliasAudit = (_input: unknown, record: SkillAliasRecord) => ({ type: 'skill_alias', id: record.id });
const aliasMetadata = (_input: unknown, record: SkillAliasRecord) => ({ skill: record.skill, alias: record.alias });

export const listSkillAliases = defineSkillAliasUseCase({
  name: 'listSkillAliases',
  input: z.object({}),
  permission: 'skill_alias:manage',
  audit: { skip: 'read of organization settings' },
  handler: ({ deps, actor }): Promise<SkillAliasOverview> => deps.skillAliases.load(actor.organizationId),
});

/**
 * `alias` becomes another way of writing `skill`. A skill the dictionary knows (under any of its names) keeps its name;
 * an unknown one becomes a skill of the organization. An alias belongs to one skill only.
 */
export const addSkillAlias = defineSkillAliasUseCase({
  name: 'addSkillAlias',
  input: addSkillAliasInputSchema,
  permission: 'skill_alias:manage',
  audit: { action: 'skill_alias.added', target: aliasAudit, metadata: aliasMetadata },
  handler: async ({ deps, actor, input }): Promise<SkillAliasRecord> => {
    const loaded = await deps.skillAliases.load(actor.organizationId);
    if (loaded.aliases.length >= ORGANIZATION_SKILL_ALIASES_MAX) throw new ConflictError('alias_limit');
    const book = skillBookOf(toSkillAliasConfig(loaded));
    const skill = canonicalSkillName(book, input.skill);
    const issue = checkNewSkillAlias(book, skill, input.alias);
    if (issue !== null) throw new ConflictError(issue);
    return deps.skillAliases.add({
      id: deps.newId(),
      organizationId: actor.organizationId,
      skill,
      alias: input.alias,
      aliasKey: normalizeSkill(input.alias),
      createdBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      createdAt: deps.now(),
    });
  },
});

export const removeSkillAlias = defineSkillAliasUseCase({
  name: 'removeSkillAlias',
  input: removeSkillAliasInputSchema,
  permission: 'skill_alias:manage',
  audit: { action: 'skill_alias.removed', target: aliasAudit, metadata: aliasMetadata },
  handler: async ({ deps, actor, input }): Promise<SkillAliasRecord> => {
    const removed = await deps.skillAliases.remove(actor.organizationId, input.aliasId);
    if (removed === null) throw new NotFoundError('Skill alias not found.');
    return removed;
  },
});

/** The outcome of switching a built-in alias: `changed` is false when it was already in that state. */
export interface BuiltInAliasChange {
  readonly alias: string;
  readonly aliasKey: string;
  readonly changed: boolean;
}

const builtInTarget = (_input: unknown, result: BuiltInAliasChange) => ({ type: 'skill_alias', id: result.aliasKey });
const builtInMetadata = (_input: unknown, result: BuiltInAliasChange) => ({ alias: result.alias, builtIn: true });

function requireBuiltInAlias(alias: string): string {
  const key = normalizeSkill(alias);
  if (!builtInAliasKeys.has(key)) throw new NotFoundError('Built-in alias not found.');
  return key;
}

/** Switches a built-in alias off for this organization: searches no longer treat it as the same skill. */
export const disableBuiltInSkillAlias = defineSkillAliasUseCase({
  name: 'disableBuiltInSkillAlias',
  input: builtInSkillAliasInputSchema,
  permission: 'skill_alias:manage',
  audit: { action: (_input, result: BuiltInAliasChange) => (result.changed ? 'skill_alias.disabled' : null), target: builtInTarget, metadata: builtInMetadata },
  handler: async ({ deps, actor, input }): Promise<BuiltInAliasChange> => {
    const aliasKey = requireBuiltInAlias(input.alias);
    const changed = await deps.skillAliases.disable(actor.organizationId, aliasKey, actor.onBehalfOfUserId ?? actor.id ?? 'system', deps.now());
    return { alias: input.alias, aliasKey, changed };
  },
});

export const enableBuiltInSkillAlias = defineSkillAliasUseCase({
  name: 'enableBuiltInSkillAlias',
  input: builtInSkillAliasInputSchema,
  permission: 'skill_alias:manage',
  audit: { action: (_input, result: BuiltInAliasChange) => (result.changed ? 'skill_alias.enabled' : null), target: builtInTarget, metadata: builtInMetadata },
  handler: async ({ deps, actor, input }): Promise<BuiltInAliasChange> => {
    const aliasKey = requireBuiltInAlias(input.alias);
    return { alias: input.alias, aliasKey, changed: await deps.skillAliases.enable(actor.organizationId, aliasKey) };
  },
});
