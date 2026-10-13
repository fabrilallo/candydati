<script setup lang="ts">
import { ArchiveIcon, CircleCheckIcon, LayersIcon, PencilLineIcon } from '@lucide/vue'
import type { JobStatus } from '@tt/domain'
import type { JobCounts } from '@/lib/job-counts'
import type { TabItem } from '@/lib/tabs'

/** Status filter of the jobs list as underline tabs, each with its icon and real count. */
const props = defineProps<{ status: JobStatus | null; counts: JobCounts | null }>()
const emit = defineEmits<{ 'update:status': [status: JobStatus | null] }>()
const { t } = useI18n()
type Choice = JobStatus | 'all'
const icons = { all: LayersIcon, draft: PencilLineIcon, published: CircleCheckIcon, closed: ArchiveIcon } as const
const choices: readonly Choice[] = ['all', 'draft', 'published', 'closed']
const items = computed<readonly TabItem<Choice>[]>(() =>
  choices.map((choice) => ({
    value: choice,
    label: t(`job.list.filters.${choice}`),
    icon: icons[choice],
    count: props.counts ? (choice === 'all' ? props.counts.total : props.counts[choice]) : null,
    testId: `filter-${choice}`,
    countTestId: `count-${choice}`,
  })),
)
const selected = computed<Choice>({
  get: () => props.status ?? 'all',
  set: (choice) => emit('update:status', choice === 'all' ? null : choice),
})
</script>

<template>
  <UnderlineTabs v-model="selected" :items="items" :label="t('job.list.filterLabel')" />
</template>
