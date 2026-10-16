<script setup lang="ts">
import type { JobStatsDto } from '@candydati/domain'
import { formatDuration } from '@/lib/job-view'
import { formatDecimal } from '@/lib/stats-view'

/** What published ads promise candidates about the process, as three large figures (averages over published ads). */
const props = defineProps<{ process: JobStatsDto['process'] }>()
const { t, locale } = useI18n()
const figures = computed(() => {
  const p = props.process
  if (p.averageStages === null || p.averageProcessMinutes === null || p.averageResponseDays === null) return []
  return [
    { id: 'stages', value: formatDecimal(p.averageStages, locale.value), label: t('dashboard.stats.process.stages') },
    { id: 'time', value: formatDuration(p.averageProcessMinutes, t), label: t('dashboard.stats.process.time') },
    { id: 'response', value: t('dashboard.stats.process.days', { n: formatDecimal(p.averageResponseDays, locale.value) }), label: t('dashboard.stats.process.response') },
  ]
})
</script>

<template>
  <StatCard id="stat-process" :title="t('dashboard.stats.process.title')" :hint="process.jobCount > 0 ? t('dashboard.stats.process.hint', process.jobCount) : undefined">
    <dl v-if="figures.length > 0" class="grid h-full content-between gap-4">
      <div v-for="figure in figures" :key="figure.id" class="grid gap-0.5 border-t pt-3.5 first:border-t-0 first:pt-0" :data-testid="`process-${figure.id}`">
        <dt class="order-2 text-sm text-muted-foreground">{{ figure.label }}</dt>
        <dd class="figure order-1 text-3xl font-semibold tracking-tight">{{ figure.value }}</dd>
      </div>
    </dl>
    <ChartEmpty v-else :title="t('dashboard.stats.process.emptyTitle')" :body="t('dashboard.stats.process.emptyBody')" />
  </StatCard>
</template>
