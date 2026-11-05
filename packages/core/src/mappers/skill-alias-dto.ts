import { builtInSkillView, ORGANIZATION_SKILL_ALIASES_MAX, type SkillAliasDto, type SkillAliasOverviewDto } from '@candydati/domain';
import type { SkillAliasRecord } from '../skill-alias-ports.js';
import type { SkillAliasOverview } from '../use-cases/skills/skill-aliases.js';

export const toSkillAliasDto = (record: SkillAliasRecord): SkillAliasDto => ({
  id: record.id,
  skill: record.skill,
  alias: record.alias,
  createdAt: record.createdAt.toISOString(),
});

export const toSkillAliasOverviewDto = (overview: SkillAliasOverview): SkillAliasOverviewDto => ({
  builtIn: builtInSkillView({ disabled: overview.disabled }).map((entry) => ({ ...entry, aliases: [...entry.aliases] })),
  own: overview.aliases.map(toSkillAliasDto),
  limit: ORGANIZATION_SKILL_ALIASES_MAX,
});
