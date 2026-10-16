<script setup lang="ts">
import type { FunnelStageType, ReportsDto } from '@candydati/domain'
import { formatDaysValue, formatRate, NO_VALUE, responseTime, stageTypeRows } from '@/lib/report-view'

/**
 * The response promise of the ads: share kept with its basis, median response time, what is waiting now, and per stage
 * type a bar split into kept and missed. Missed is the only status colour (warning).
 */
const props = defineProps<{ responses: ReportsDto['responses'] | null }>()
const { t, locale } = useI18n()
const rows = computed(() => stageTypeRows(props.responses?.byStageType ?? []).filter((row) => row.total > 0))
const closed = computed(() => (props.responses?.kept ?? 0) + (props.responses?.missed ?? 0))
const median = computed(() => responseTime(props.responses?.responseHours.median ?? null))
const medianText = computed(() => {
  const value = median.value
  if (!value) return null
  return value.unit === 'hours' ? t('reports.responses.hours', { n: value.value }) : t('reports.responses.days', { n: formatDaysValue(value.value, locale.value) })
})
const stageLabel = (type: FunnelStageType): string => (type === 'received' ? t('reports.responses.firstResponse') : t(`taxonomy.stageTypes.${type}`))
</script>

<template>
  <StatCard id="report-responses" :title="t('reports.responses.title')" :hint="t('reports.responses.info')">
    <template v-if="responses && (closed > 0 || responses.open > 0)" #figure>
      <div class="grid gap-4">
        <p class="flex flex-wrap items-baseline gap-x-1.5 gap-y-1" data-testid="responses-kept">
          <span class="figure text-4xl font-semibold tracking-tight">{{ formatRate(responses.closed, locale) }}</span>
          <span class="text-sm text-muted-foreground">{{ t('reports.responses.keptLabel') }}</span>
          <span class="figure w-full text-xs text-muted-foreground">{{ t('reports.basis', { count: responses.kept, total: closed }) }}</span>
        </p>
        <dl class="grid grid-cols-3 gap-3 border-t pt-3.5 text-sm">
          <div class="grid gap-0.5">
            <dt class="text-xs text-muted-foreground">{{ t('reports.responses.median') }}</dt>
            <dd class="figure font-semibold" data-testid="responses-median">{{ medianText ?? NO_VALUE }}</dd>
          </div>
          <div class="grid gap-0.5">
            <dt class="text-xs text-muted-foreground">{{ t('reports.responses.open') }}</dt>
            <dd class="figure font-semibold" data-testid="responses-open">{{ responses.open }}</dd>
          </div>
          <div class="grid gap-0.5">
            <dt class="text-xs text-muted-foreground">{{ t('reports.responses.overdue') }}</dt>
            <dd class="figure font-semibold" :class="responses.overdue > 0 ? 'text-warning' : ''" data-testid="responses-overdue">{{ responses.overdue }}</dd>
          </div>
        </dl>
      </div>
    </template>
    <p v-if="!responses" class="text-sm text-muted-foreground" data-testid="section-error">{{ t('reports.sectionError') }}</p>
    <ul v-else-if="rows.length > 0" class="grid gap-3.5" data-testid="response-rows">
      <li v-for="row in rows" :key="row.type" class="grid gap-1" data-testid="response-row">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
          <span class="min-w-0 font-medium">{{ stageLabel(row.type) }}</span>
          <span class="figure shrink-0 text-xs text-muted-foreground">
            <span class="text-sm font-semibold text-foreground">{{ formatRate(row.keptRate, locale) }}</span>
            {{ t('reports.responses.rowBasis', { kept: row.kept, missed: row.missed }) }}
          </span>
        </div>
        <div class="flex h-2 gap-0.5" aria-hidden="true">
          <div v-if="row.kept > 0" class="h-full rounded-full bg-primary" :style="{ width: `${row.keptWidth}%` }" />
          <div v-if="row.missed > 0" class="h-full rounded-full bg-warning" :style="{ width: `${row.missedWidth}%` }" />
        </div>
      </li>
    </ul>
    <ChartEmpty v-else :title="t('reports.responses.emptyTitle')" :body="t('reports.responses.emptyBody')" />
    <template v-if="rows.length > 0" #footer>
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
        <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-primary" />{{ t('reports.responses.kept') }}</li>
        <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-warning" />{{ t('reports.responses.missed') }}</li>
      </ul>
    </template>
  </StatCard>
</template>
