import {
  attachPackResultSchema,
  automationPackRuleSchema,
  automationPackSchema,
  type AttachPackResultDto,
  type AutomationPackDto,
  type AutomationPackInput,
  type AutomationPackRuleDto,
  type AutomationPackRuleInput,
} from '@candydati/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** Automation packs: rules kept once per organization, by stage type, attached to jobs (HTTP). */
const id = (value: string): string => encodeURIComponent(value)
const PACKS = '/api/v1/automation-packs'
const packIdsSchema = z.object({ packIds: z.array(z.string()) })

export const listPacks = async (request: JobApiRequest): Promise<readonly AutomationPackDto[]> => (await callApi(request, PACKS, z.array(automationPackSchema))).data

export const createPack = async (request: JobApiRequest, input: AutomationPackInput): Promise<AutomationPackDto> =>
  (await callApi(request, PACKS, automationPackSchema, { method: 'POST', body: input })).data

export const updatePack = async (request: JobApiRequest, packId: string, input: AutomationPackInput): Promise<AutomationPackDto> =>
  (await callApi(request, `${PACKS}/${id(packId)}`, automationPackSchema, { method: 'PUT', body: input })).data

export const deletePack = async (request: JobApiRequest, packId: string): Promise<void> => {
  await callApi(request, `${PACKS}/${id(packId)}`, z.unknown(), { method: 'DELETE' })
}

export const listPackRules = async (request: JobApiRequest, packId: string): Promise<readonly AutomationPackRuleDto[]> =>
  (await callApi(request, `${PACKS}/${id(packId)}/rules`, z.array(automationPackRuleSchema))).data

export const createPackRule = async (request: JobApiRequest, packId: string, input: AutomationPackRuleInput): Promise<AutomationPackRuleDto> =>
  (await callApi(request, `${PACKS}/${id(packId)}/rules`, automationPackRuleSchema, { method: 'POST', body: input })).data

export const updatePackRule = async (request: JobApiRequest, ruleId: string, input: AutomationPackRuleInput): Promise<AutomationPackRuleDto> =>
  (await callApi(request, `/api/v1/automation-pack-rules/${id(ruleId)}`, automationPackRuleSchema, { method: 'PUT', body: input })).data

export const deletePackRule = async (request: JobApiRequest, ruleId: string): Promise<void> => {
  await callApi(request, `/api/v1/automation-pack-rules/${id(ruleId)}`, z.unknown(), { method: 'DELETE' })
}

/** Copies the pack's rules into the job; attaching again brings the copies up to date. */
export const attachPack = async (request: JobApiRequest, jobId: string, packId: string): Promise<AttachPackResultDto> =>
  (await callApi(request, `/api/v1/jobs/${id(jobId)}/automation-packs`, attachPackResultSchema, { method: 'POST', body: { packId } })).data

export const getTemplatePacks = async (request: JobApiRequest, templateId: string): Promise<readonly string[]> =>
  (await callApi(request, `/api/v1/job-templates/${id(templateId)}/automation-packs`, packIdsSchema)).data.packIds

export const setTemplatePacks = async (request: JobApiRequest, templateId: string, packIds: readonly string[]): Promise<readonly string[]> =>
  (await callApi(request, `/api/v1/job-templates/${id(templateId)}/automation-packs`, packIdsSchema, { method: 'PUT', body: { packIds } })).data.packIds
