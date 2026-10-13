<script setup lang="ts">
import { OUTCOMES, type FunnelStageType, type ReportsDto } from '@tt/domain'
import { formatRate, funnelRows } from '@/lib/report-view'

/**
 * Applications that entered each stage in the period, as horizontal bars without a track (the widest is the
 * reference), with the share that moved on to the next stage between rows. The rows are the text alternative.
 */
const props = defineProps<{ funnel: ReportsDto['funnel'] | null }>()
const { t, locale } = useI18n()
const rows = computed(() => (props.funnel ? funnelRows(props.funnel.stages) : []))
const hasData = computed(() => rows.value.some((row) => row.entered > 0))
const stageLabel = (row: { type: FunnelStageType; title: string | null }): string =>
  row.title ?? (row.type === 'received' ? t('reports.received') : t(`taxonomy.stageTypes.${row.type}`))
const outcomeTotal = computed(() => (props.funnel ? OUTCOMES.reduce((sum, outcome) => sum + props.funnel!.outcomes[outcome], 0) : 0))
</script>

<template>
  <StatCard id="report-funnel" :title="t('reports.funnel.title')" :hint="t('reports.funnel.info')">
    <p v-if="!funnel" class="text-sm text-muted-foreground" data-testid="section-error">{{ t('reports.sectionError') }}</p>
    <ol v-else-if="hasData" class="grid gap-1" data-testid="funnel-rows">
      <li v-for="(row, index) in rows" :key="row.stageId ?? row.type" class="grid gap-1" data-testid="funnel-row">
        <div class="flex items-baseline justify-between gap-3 text-sm">
          <span class="min-w-0 truncate font-medium">{{ stageLabel(row) }}</span>
          <span class="figure shrink-0 text-muted-foreground"><span class="font-semibold text-foreground">{{ row.entered }}</span> {{ t('reports.funnel.entered', row.entered) }}</span>
        </div>
        <div class="h-2.5" aria-hidden="true">
          <div class="h-full rounded-full bg-primary" :class="index === 0 ? '' : 'opacity-80'" :style="{ width: `${Math.max(row.width, row.entered > 0 ? 1 : 0)}%` }" />
        </div>
        <p v-if="row.conversionToNext" class="figure py-1.5 pl-3 text-xs text-muted-foreground" data-testid="funnel-conversion">
          <span class="font-medium text-foreground">{{ formatRate(row.conversionToNext, locale) }}</span>
          {{ t('reports.funnel.toNext', { count: row.conversionToNext.count, total: row.conversionToNext.total }) }}
        </p>
      </li>
    </ol>
    <ChartEmpty v-else :title="t('reports.funnel.emptyTitle')" :body="t('reports.funnel.emptyBody')" />
    <template v-if="funnel && outcomeTotal > 0" #footer>
      <dl class="grid grid-cols-3 gap-3 border-t pt-4" data-testid="funnel-outcomes">
        <div v-for="outcome in OUTCOMES" :key="outcome" class="grid gap-0.5">
          <dt class="text-xs text-muted-foreground">{{ t(`reports.outcomes.${outcome}`) }}</dt>
          <dd class="figure text-lg font-semibold">{{ funnel?.outcomes[outcome] }}</dd>
        </div>
      </dl>
    </template>
  </StatCard>
</template>
