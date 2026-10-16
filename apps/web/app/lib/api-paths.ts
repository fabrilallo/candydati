/**
 * Paths of the api the web calls, in one place. Builders encode every id. One section per area.
 */
const enc = (value: string): string => encodeURIComponent(value)

// API keys, OpenAPI, MCP, internal agent
export const API_KEYS_PATH = '/api/v1/api-keys'
export const apiKeyPath = (id: string): string => `${API_KEYS_PATH}/${enc(id)}`
export const OPENAPI_PATH = '/api/v1/openapi.json'
export const AGENT_CHAT_PATH = '/api/v1/agent/chat'
export const AGENT_STATUS_PATH = '/api/v1/agent/status'

// Distribution
export const DISTRIBUTION_PATH = '/api/v1/distribution'
export const jobDistributionPath = (jobId: string): string => `/api/v1/jobs/${enc(jobId)}/distribution`
export const jobDistributionSyncPath = (jobId: string): string => `${jobDistributionPath(jobId)}/sync`
export const channelSettingPath = (channelId: string): string => `${DISTRIBUTION_PATH}/channels/${enc(channelId)}`

// Interviewers, feedback, job requests, approval, stale ads, reports
export const jobInterviewersPath = (jobId: string): string => `/api/v1/jobs/${enc(jobId)}/interviewers`
export const applicationFeedbackPath = (applicationId: string): string => `/api/v1/applications/${enc(applicationId)}/feedback`
export const requestFeedbackPath = (applicationId: string): string => `${applicationFeedbackPath(applicationId)}/request`
export const publicFeedbackPath = (token: string): string => `/api/v1/public/feedback/${enc(token)}`
export const publicFeedbackCvPath = (token: string): string => `${publicFeedbackPath(token)}/cv`
export const JOB_REQUESTS_PATH = '/api/v1/job-requests'
export const jobRequestPath = (id: string): string => `${JOB_REQUESTS_PATH}/${enc(id)}`
export const approveJobRequestPath = (id: string): string => `${jobRequestPath(id)}/approve`
export const rejectJobRequestPath = (id: string): string => `${jobRequestPath(id)}/reject`
export const convertJobRequestPath = (id: string): string => `${jobRequestPath(id)}/convert`
export const APPROVAL_SETTINGS_PATH = '/api/v1/settings/approval'
export const ACCESS_SETTINGS_PATH = '/api/v1/settings/access'
export const jobTeamPath = (jobId: string): string => `/api/v1/jobs/${enc(jobId)}/team`
export const jobTeamMemberPath = (jobId: string, userId: string): string => `${jobTeamPath(jobId)}/${enc(userId)}`
export const jobApprovalPath = (jobId: string): string => `/api/v1/jobs/${enc(jobId)}/approval`
export const jobApprovalRequestPath = (jobId: string): string => `/api/v1/jobs/${enc(jobId)}/approval-request`
export const STALE_JOBS_PATH = '/api/v1/jobs/stale'
export const REPORTS_PATH = '/api/v1/reports'
export const REPORTS_CSV_PATH = '/api/v1/reports/export.csv'

// Imports and public reconfirmation
export const IMPORTS_PATH = '/api/v1/imports'
export const importPath = (batchId: string): string => `${IMPORTS_PATH}/${enc(batchId)}`
export const importMappingPath = (batchId: string): string => `${importPath(batchId)}/mapping`
export const importItemsPath = (batchId: string): string => `${importPath(batchId)}/items`
export const importCommitPath = (batchId: string): string => `${importPath(batchId)}/commit`
export const importUndoPath = (batchId: string): string => `${importPath(batchId)}/undo`

// Migration from another ATS
export const MIGRATIONS_PATH = '/api/v1/migrations'
export const migrationPath = (id: string): string => `${MIGRATIONS_PATH}/${enc(id)}`
export const migrationIssuesPath = (id: string): string => `${migrationPath(id)}/issues`
export const migrationChoicesPath = (id: string): string => `${migrationPath(id)}/choices`
export const migrationCommitPath = (id: string): string => `${migrationPath(id)}/commit`
export const migrationUndoPath = (id: string): string => `${migrationPath(id)}/undo`
export const publicConsentPath = (token: string): string => `/api/v1/public/consent/${enc(token)}`
