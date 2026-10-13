<script setup lang="ts">
import { FileTextIcon, UsersRoundIcon } from '@lucide/vue'
import type { LinkTab } from '@/lib/tabs'

/** "Candidati" and "Annuncio": the two pages of a job, with the number of open applications when known. */
const props = defineProps<{ jobId: string; current: 'ad' | 'candidates' }>()
const { t } = useI18n()
const { pipeline } = usePipelineData(props.jobId)
const base = computed(() => `/app/jobs/${encodeURIComponent(props.jobId)}`)
const count = computed(() => (pipeline.value ? pipeline.value.applications.filter((app) => app.outcome === null).length : null))
const items = computed<readonly LinkTab[]>(() => [
  { to: `${base.value}/candidates`, label: t('pipeline.tabs.candidates'), icon: UsersRoundIcon, count: count.value, testId: 'tab-candidates' },
  { to: base.value, label: t('pipeline.tabs.ad'), icon: FileTextIcon, testId: 'tab-ad' },
])
</script>

<template>
  <LinkTabs :items="items" :label="t('pipeline.tabs.label')" :current="current === 'ad' ? base : `${base}/candidates`" />
</template>
