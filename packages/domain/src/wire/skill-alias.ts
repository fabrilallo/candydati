import { z } from 'zod';
import { isoDate } from './common.js';

/** An alias the organization added: `alias` is another way of writing `skill`. */
export const skillAliasSchema = z.object({ id: z.string(), skill: z.string(), alias: z.string(), createdAt: isoDate });
export type SkillAliasDto = z.output<typeof skillAliasSchema>;

/** A built-in skill with its aliases, each on or off for the organization. */
export const builtInSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.object({ alias: z.string(), enabled: z.boolean() })),
});
export type BuiltInSkillDto = z.output<typeof builtInSkillSchema>;

export const skillAliasOverviewSchema = z.object({
  builtIn: z.array(builtInSkillSchema),
  own: z.array(skillAliasSchema),
  /** Most aliases an organization may add. */
  limit: z.number().int().positive(),
});
export type SkillAliasOverviewDto = z.output<typeof skillAliasOverviewSchema>;

/** Which spelling met a skill criterion: the criterion as declared, and the name the CV uses ("Go" met by "Golang"). */
export const skillMatchSchema = z.object({ criterion: z.string(), matchedAs: z.string() });
export type SkillMatchDto = z.output<typeof skillMatchSchema>;
