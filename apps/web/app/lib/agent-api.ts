import { agentStatusSchema, type AgentStatusDto } from '@tt/domain'
import { AGENT_STATUS_PATH } from './api-paths'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** Whether the internal assistant is configured on this instance (`AGENT_MODEL` and its provider key). */
export const getAgentStatus = async (request: JobApiRequest): Promise<AgentStatusDto> => (await callApi(request, AGENT_STATUS_PATH, agentStatusSchema)).data
