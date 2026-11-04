import {
  applicationCardSchema,
  automationPreviewSchema,
  automationRuleSchema,
  copyAutomationsResultSchema,
  moveProposalSchema,
  templateAutomationRuleSchema,
  webhookCreatedSchema,
  webhookDeliverySchema,
  webhookEndpointSchema,
  type AutomationMatchInput,
  type AutomationPreviewDto,
  type AutomationRuleDto,
  type AutomationRuleInput,
  type ApplicationCardDto,
  type CopyAutomationsInput,
  type CopyAutomationsResultDto,
  type MoveProposalDto,
  type TemplateAutomationRuleDto,
  type WebhookCreatedDto,
  type WebhookDeliveryDto,
  type WebhookEndpointDto,
} from '@candydati/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** Automations per stage of a job and webhooks of the organization (phase 4 contract, HTTP). */
const id = (value: string): string => encodeURIComponent(value)
const WEBHOOKS = '/api/v1/webhooks'

export type RuleInput = AutomationRuleInput

export const listRules = async (request: JobApiRequest, jobId: string): Promise<readonly AutomationRuleDto[]> =>
  (await callApi(request, `/api/v1/jobs/${id(jobId)}/automations`, z.array(automationRuleSchema))).data

export const createRule = async (request: JobApiRequest, jobId: string, input: RuleInput): Promise<AutomationRuleDto> =>
  (await callApi(request, `/api/v1/jobs/${id(jobId)}/automations`, automationRuleSchema, { method: 'POST', body: input })).data

export const updateRule = async (request: JobApiRequest, ruleId: string, input: RuleInput): Promise<AutomationRuleDto> =>
  (await callApi(request, `/api/v1/automations/${id(ruleId)}`, automationRuleSchema, { method: 'PUT', body: input })).data

/** Read-only: who the rule being edited would act for now. `ruleId` once it is saved, so what it already did is left out. */
export const previewRule = async (request: JobApiRequest, jobId: string, input: AutomationMatchInput & { readonly ruleId?: string }): Promise<AutomationPreviewDto> =>
  (await callApi(request, `/api/v1/jobs/${id(jobId)}/automations/preview`, automationPreviewSchema, { method: 'POST', body: input })).data

export const deleteRule = async (request: JobApiRequest, ruleId: string): Promise<void> => {
  await callApi(request, `/api/v1/automations/${id(ruleId)}`, z.unknown(), { method: 'DELETE' })
}

/** Copies rules (some, or every rule of a stage) of a job or template to one stage of a job or template. */
export const copyRules = async (request: JobApiRequest, input: CopyAutomationsInput): Promise<CopyAutomationsResultDto> =>
  (await callApi(request, '/api/v1/automations/copy', copyAutomationsResultSchema, { method: 'POST', body: input })).data

export const listTemplateRules = async (request: JobApiRequest, templateId: string): Promise<readonly TemplateAutomationRuleDto[]> =>
  (await callApi(request, `/api/v1/job-templates/${id(templateId)}/automations`, z.array(templateAutomationRuleSchema))).data

export const deleteTemplateRule = async (request: JobApiRequest, ruleId: string): Promise<void> => {
  await callApi(request, `/api/v1/job-template-automations/${id(ruleId)}`, z.unknown(), { method: 'DELETE' })
}

/** Live proposals of `propose_move` rules: of one application, or of every job the person reaches. */
export const listProposals = async (request: JobApiRequest, applicationId: string | null): Promise<readonly MoveProposalDto[]> =>
  (await callApi(request, `/api/v1/move-proposals${applicationId === null ? '' : `?applicationId=${id(applicationId)}`}`, z.array(moveProposalSchema))).data

/** The person confirms: the normal move, in their name. Returns the moved application. */
export const confirmProposal = async (request: JobApiRequest, proposalId: string): Promise<ApplicationCardDto> =>
  (await callApi(request, `/api/v1/move-proposals/${id(proposalId)}/confirm`, z.object({ application: applicationCardSchema }), { method: 'POST', body: {} })).data.application

export const dismissProposal = async (request: JobApiRequest, proposalId: string): Promise<void> => {
  await callApi(request, `/api/v1/move-proposals/${id(proposalId)}/dismiss`, z.unknown(), { method: 'POST', body: {} })
}

export interface WebhookInput {
  readonly url: string
  readonly events: readonly string[]
  readonly enabled: boolean
}

export const listWebhooks = async (request: JobApiRequest): Promise<readonly WebhookEndpointDto[]> => (await callApi(request, WEBHOOKS, z.array(webhookEndpointSchema))).data

/** The only answer that carries the secret: show it once, never store it. */
export const createWebhook = async (request: JobApiRequest, input: WebhookInput): Promise<WebhookCreatedDto> =>
  (await callApi(request, WEBHOOKS, webhookCreatedSchema, { method: 'POST', body: input })).data

export const updateWebhook = async (request: JobApiRequest, webhookId: string, input: WebhookInput): Promise<WebhookEndpointDto> =>
  (await callApi(request, `${WEBHOOKS}/${id(webhookId)}`, webhookEndpointSchema, { method: 'PUT', body: input })).data

export const deleteWebhook = async (request: JobApiRequest, webhookId: string): Promise<void> => {
  await callApi(request, `${WEBHOOKS}/${id(webhookId)}`, z.unknown(), { method: 'DELETE' })
}

/** Sends a `ping` event; the delivery shows up in the log. */
export const testWebhook = async (request: JobApiRequest, webhookId: string): Promise<void> => {
  await callApi(request, `${WEBHOOKS}/${id(webhookId)}/test`, z.unknown(), { method: 'POST', body: {} })
}

export const listDeliveries = async (request: JobApiRequest, webhookId: string): Promise<readonly WebhookDeliveryDto[]> =>
  (await callApi(request, `${WEBHOOKS}/${id(webhookId)}/deliveries`, z.array(webhookDeliverySchema))).data
