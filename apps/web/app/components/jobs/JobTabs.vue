<script setup lang="ts">
import { FileTextIcon, RadioTowerIcon, SendIcon, UserCogIcon, UserSearchIcon, UsersRoundIcon, WorkflowIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'
import type { LinkTab } from '@/lib/tabs'

/**
 * "Candidati", "Annuncio", "Team" (with `job_team:read`) and, with `automation:manage`, "Automazioni" and, with `job:publish`, "Distribuzione": the pages of a job. Candidati carries the
 * number of open applications when known and shows only to who can read candidates. "Shortlist" appears on a client job of
 * an agency, for who can read shortlists.
 */
const props = defineProps<{ jobId: string; current: 'ad' | 'candidates' | 'sourcing' | 'team' | 'automations' | 'distribution' | 'shortlists' }>()
const { t } = useI18n()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const canReadCandidates = can(role.value, 'candidate:read')
const { pipeline } = canReadCandidates ? usePipelineData(props.jobId) : { pipeline: computed(() => null) }
const canReadShortlists = can(role.value, 'shortlist:read')
const { recruitsForClients } = canReadShortlists ? useAgencySetting() : { recruitsForClients: computed(() => false) }
const { jobClient } = canReadShortlists ? useJobClient(props.jobId, recruitsForClients) : { jobClient: computed(() => null) }
const hasClient = computed(() => recruitsForClients.value && Boolean(jobClient.value?.client))
const base = computed(() => `/app/jobs/${encodeURIComponent(props.jobId)}`)
const count = computed(() => (pipeline.value ? pipeline.value.applications.filter((app) => app.outcome === null).length : null))
const items = computed<readonly LinkTab[]>(() => [
  ...(canReadCandidates ? [{ to: `${base.value}/candidates`, label: t('pipeline.tabs.candidates'), icon: UsersRoundIcon, count: count.value, testId: 'tab-candidates' }] : []),
  // People found outside Candydati for this job (contacts, not candidates), for who may source.
  ...(can(role.value, 'sourcing:manage') ? [{ to: `${base.value}/sourcing`, label: t('pipeline.tabs.sourcing'), icon: UserSearchIcon, testId: 'tab-sourcing' }] : []),
  { to: base.value, label: t('pipeline.tabs.ad'), icon: FileTextIcon, testId: 'tab-ad' },
  ...(hasClient.value ? [{ to: `${base.value}/shortlists`, label: t('pipeline.tabs.shortlists'), icon: SendIcon, testId: 'tab-shortlists' }] : []),
  ...(can(role.value, 'job_team:read') ? [{ to: `${base.value}/team`, label: t('pipeline.tabs.team'), icon: UserCogIcon, testId: 'tab-team' }] : []),
  ...(can(role.value, 'automation:manage') ? [{ to: `${base.value}/automations`, label: t('pipeline.tabs.automations'), icon: WorkflowIcon, testId: 'tab-automations' }] : []),
  ...(can(role.value, 'job:publish') ? [{ to: `${base.value}/distribution`, label: t('pipeline.tabs.distribution'), icon: RadioTowerIcon, testId: 'tab-distribution' }] : []),
])
const currentPath = computed(() => ({ ad: base.value, candidates: `${base.value}/candidates`, sourcing: `${base.value}/sourcing`, team: `${base.value}/team`, automations: `${base.value}/automations`, distribution: `${base.value}/distribution`, shortlists: `${base.value}/shortlists` })[props.current])
</script>

<template>
  <LinkTabs :items="items" :label="t('pipeline.tabs.label')" :current="currentPath" />
</template>
