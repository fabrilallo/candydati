import { skillAliasOverviewSchema, skillAliasSchema, type SkillAliasDto, type SkillAliasOverviewDto } from '@candydati/domain'
import { z } from 'zod'
import { callApi, defaultFailureKey, type FailureKey } from './api-call'
import type { JobApiRequest } from './job-api'

/** The organization's own skill aliases on top of the built-in dictionary (`skill_alias:manage`). */
const SKILL_ALIASES = '/api/v1/skill-aliases'

const CONFLICT_KEYS: Readonly<Record<string, string>> = {
  alias_taken: 'skills.errors.aliasTaken',
  alias_redundant: 'skills.errors.aliasRedundant',
  alias_limit: 'skills.errors.aliasLimit',
}

/** Pure: the api says why an alias was refused (`409` with the reason); everything else is the usual error. */
export const skillAliasFailureKey: FailureKey = (failure) => {
  if (failure.code === 'conflict' && failure.message && CONFLICT_KEYS[failure.message]) return CONFLICT_KEYS[failure.message] as string
  if (failure.code === 'validation_failed') return 'skills.errors.invalid'
  return defaultFailureKey(failure)
}

export interface SkillAliasInput {
  readonly skill: string
  readonly alias: string
}

export const getSkillAliases = async (request: JobApiRequest): Promise<SkillAliasOverviewDto> => (await callApi(request, SKILL_ALIASES, skillAliasOverviewSchema)).data

export const addSkillAlias = async (request: JobApiRequest, input: SkillAliasInput): Promise<SkillAliasDto> =>
  (await callApi(request, SKILL_ALIASES, skillAliasSchema, { method: 'POST', body: input }, skillAliasFailureKey)).data

export const removeSkillAlias = async (request: JobApiRequest, id: string): Promise<void> => {
  await callApi(request, `${SKILL_ALIASES}/${encodeURIComponent(id)}`, z.unknown(), { method: 'DELETE' })
}

export const setBuiltInSkillAlias = async (request: JobApiRequest, alias: string, enabled: boolean): Promise<void> => {
  await callApi(request, `${SKILL_ALIASES}/built-in/${enabled ? 'enable' : 'disable'}`, z.unknown(), { method: 'POST', body: { alias } })
}
