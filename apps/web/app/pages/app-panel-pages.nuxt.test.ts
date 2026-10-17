import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeJob, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import Attention from './app/attention.vue'
import Tasks from './app/tasks.vue'
import Reports from './app/reports.vue'
import Candidates from './app/candidates/index.vue'
import ImportsIndex from './app/imports/index.vue'
import ImportsNew from './app/imports/new.vue'
import JobRequestsIndex from './app/job-requests/index.vue'
import JobRequestsNew from './app/job-requests/new.vue'
import Templates from './app/jobs/templates.vue'
import JobTeam from './app/jobs/[id]/team.vue'
import JobAutomations from './app/jobs/[id]/automations.vue'
import JobDistribution from './app/jobs/[id]/distribution.vue'
import SettingsAi from './app/settings/ai.vue'
import SettingsApi from './app/settings/api.vue'
import SettingsAudit from './app/settings/audit-log.vue'
import SettingsData from './app/settings/data.vue'
import SettingsDistribution from './app/settings/distribution.vue'
import SettingsEmailTemplates from './app/settings/email-templates.vue'
import SettingsEmail from './app/settings/email.vue'
import SettingsSecurity from './app/settings/security.vue'
import SettingsWebhooks from './app/settings/webhooks.vue'

/** Pages that only place a panel under a header: each shows its panel to someone allowed. The panels have their own tests. */
const PAGES = [
  ['attention', Attention, '/app/attention', 'AttentionPanel'],
  ['my tasks', Tasks, '/app/tasks', 'MyTasksPanel'],
  ['reports', Reports, '/app/reports', 'ReportsPanel'],
  ['candidates database', Candidates, '/app/candidates', 'CandidatesPanel'],
  ['imports list', ImportsIndex, '/app/imports', 'ImportBatchList'],
  ['new import', ImportsNew, '/app/imports/new', 'ImportFilesStep'],
  ['job requests', JobRequestsIndex, '/app/job-requests', 'JobRequestList'],
  ['new job request', JobRequestsNew, '/app/job-requests/new', 'JobRequestForm'],
  ['templates', Templates, '/app/jobs/templates', 'TemplatesPanel'],
  ['job team', JobTeam, '/app/jobs/j1/team', 'JobTeamPanel'],
  ['job automations', JobAutomations, '/app/jobs/j1/automations', 'AutomationsPanel'],
  ['job distribution', JobDistribution, '/app/jobs/j1/distribution', 'JobDistributionPanel'],
  ['settings: ai', SettingsAi, '/app/settings/ai', 'InstanceAiPanel'],
  ['settings: api', SettingsApi, '/app/settings/api', 'ApiKeysPanel'],
  ['settings: audit log', SettingsAudit, '/app/settings/audit-log', 'AuditLogPanel'],
  ['settings: data', SettingsData, '/app/settings/data', 'DataExportsPanel'],
  ['settings: distribution', SettingsDistribution, '/app/settings/distribution', 'DistributionSettings'],
  ['settings: email templates', SettingsEmailTemplates, '/app/settings/email-templates', 'EmailTemplatesPanel'],
  ['settings: email', SettingsEmail, '/app/settings/email', 'EmailSettingsPanel'],
  ['settings: security', SettingsSecurity, '/app/settings/security', 'OrganizationSecurityPanel'],
  ['settings: webhooks', SettingsWebhooks, '/app/settings/webhooks', 'WebhooksPanel'],
] as const

registerEndpoint('/api/v1/jobs/j1', () => ok(makeJob()))

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  clearNuxtData()
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('pages that place a panel', () => {
  it.each(PAGES)('%s shows its panel under a heading', async (_name, component, route, panel) => {
    const wrapper = await mountSuspended(component, { route, global: { stubs: { [panel]: true } }, attachTo: document.body })
    mounted.push(wrapper)
    await expect.poll(() => wrapper.findComponent({ name: panel }).exists()).toBe(true)
    expect(wrapper.find('h1').exists()).toBe(true)
  })
})
