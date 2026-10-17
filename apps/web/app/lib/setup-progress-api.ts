import { setupProgressSchema, type SetupProgressDto } from '@candydati/domain'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** Yes or no per setup step of the organization, for the dashboard checklist. */
export const getSetupProgress = async (request: JobApiRequest): Promise<SetupProgressDto> => (await callApi(request, '/api/v1/setup-progress', setupProgressSchema)).data
