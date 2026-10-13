<script setup lang="ts">
import { FileTextIcon, UsersRoundIcon, WorkflowIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'
import type { LinkTab } from '@/lib/tabs'

/**
 * "Candidati", "Annuncio" and, with `automation:manage`, "Automazioni": the pages of a job. Candidati carries the
 * number of open applications when known and shows only to who can read candidates.
 */
const props = defineProps<{ jobId: string; current: 'ad' | 'candidates' | 'automations' }>()
const { t } = useI18n()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const canReadCandidates = can(role.value, 'candidate:read')
const { pipeline } = canReadCandidates ? usePipelineData(props.jobId) : { pipeline: computed(() => null) }
const base = computed(() => `/app/jobs/${encodeURIComponent(props.jobId)}`)
const count = computed(() => (pipeline.value ? pipeline.value.applications.filter((app) => app.outcome === null).length : null))
const items = computed<readonly LinkTab[]>(() => [
  ...(canReadCandidates ? [{ to: `${base.value}/candidates`, label: t('pipeline.tabs.candidates'), icon: UsersRoundIcon, count: count.value, testId: 'tab-candidates' }] : []),
  { to: base.value, label: t('pipeline.tabs.ad'), icon: FileTextIcon, testId: 'tab-ad' },
  ...(can(role.value, 'automation:manage') ? [{ to: `${base.value}/automations`, label: t('pipeline.tabs.automations'), icon: WorkflowIcon, testId: 'tab-automations' }] : []),
])
const currentPath = computed(() => ({ ad: base.value, candidates: `${base.value}/candidates`, automations: `${base.value}/automations` })[props.current])
</script>

<template>
  <LinkTabs :items="items" :label="t('pipeline.tabs.label')" :current="currentPath" />
</template>
