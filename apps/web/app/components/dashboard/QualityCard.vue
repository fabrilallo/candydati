<script setup lang="ts">
import type { JobStatsDto } from '@candydati/domain'
import { StackedBar } from '@unovis/ts'
import { VisAxis, VisPlotline, VisStackedBar, VisTooltip, VisXYContainer } from '@unovis/vue'
import { Badge } from '@/components/ui/badge'
import { CHART_COLORS, escapeHtml, formatDecimal, qualityRows, shortTitle, type QualityItem } from '@/lib/stats-view'

/**
 * Quality score of each published ad (0-10) against the instance threshold. Bars under the line are in the warning
 * colour: the score flags an ad, it never blocks it, and it never scores candidates.
 */
const props = defineProps<{ quality: JobStatsDto['quality']; duration: number }>()
const { t, locale } = useI18n()
const wide = useMediaQuery('(min-width: 640px)')
const labelWidth = computed(() => (wide.value ? 150 : 90))
type Row = QualityItem & { readonly index: number }
const rows = computed(() => qualityRows(props.quality.items))
const height = computed(() => Math.max(120, rows.value.length * 34 + 28))
const x = (d: Row): number => d.index
const y = (d: Row): number => d.total
const color = (d: Row): string => (d.belowThreshold ? CHART_COLORS.below : CHART_COLORS.main)
const yTick = (i: number | Date): string => (typeof i === 'number' && Number.isInteger(i) ? shortTitle(rows.value[i]?.title ?? '') : '')
const fmt = (value: number): string => formatDecimal(value, locale.value)
const triggers = {
  [StackedBar.selectors.bar]: (d: Row) =>
    `<div class="candydati-tip"><p class="candydati-tip-title">${escapeHtml(d.title)}</p><p>${t('dashboard.stats.quality.score')} <b>${fmt(d.total)} / 10</b></p></div>`,
}
</script>

<template>
  <StatCard id="stat-quality" :title="t('dashboard.stats.quality.title')" :hint="t('dashboard.stats.quality.hint', { threshold: fmt(quality.threshold) })">
    <template v-if="quality.average !== null" #figure>
      <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
        <p class="flex items-baseline gap-1.5">
          <span class="figure text-4xl font-semibold tracking-tight">{{ fmt(quality.average) }}</span>
          <span class="text-sm text-muted-foreground">{{ t('dashboard.stats.quality.average') }}</span>
        </p>
        <Badge v-if="quality.belowCount > 0" variant="warning" class="mb-1.5">{{ t('dashboard.stats.quality.below', quality.belowCount) }}</Badge>
        <Badge v-else variant="success" class="mb-1.5">{{ t('dashboard.stats.quality.allAbove') }}</Badge>
      </div>
    </template>
    <div v-if="rows.length > 0" class="candydati-chart" :style="{ height: `${height}px` }" aria-hidden="true">
      <ClientOnly>
        <VisXYContainer :data="rows" :duration="duration" :height="height" :x-domain="[0, 10]" y-direction="south" :padding="{ top: 4, right: 8 }">
          <VisStackedBar :x="x" :y="y" :color="color" orientation="horizontal" :bar-max-width="10" :rounded-corners="5" :bar-padding="0.4" />
          <VisPlotline axis="x" :value="quality.threshold" :line-width="1.5" :line-style="[4, 3]" :label-text="t('dashboard.stats.quality.thresholdLabel', { threshold: fmt(quality.threshold) })" label-position="top-right" :label-offset-y="2" />
          <VisAxis type="x" :num-ticks="5" :tick-line="false" :domain-line="false" />
          <VisAxis type="y" :tick-format="yTick" :tick-text-width="labelWidth" tick-text-fit-mode="trim" tick-text-trim-type="end" :tick-values="rows.map((row) => row.index)" :grid-line="false" :tick-line="false" :domain-line="false" />
          <VisTooltip :triggers="triggers" />
        </VisXYContainer>
        <template #fallback><div class="h-full rounded-lg bg-muted/60" /></template>
      </ClientOnly>
    </div>
    <ChartEmpty v-else :title="t('dashboard.stats.quality.emptyTitle')" :body="t('dashboard.stats.quality.emptyBody')" />
    <template #table>
      <table v-if="rows.length > 0">
        <caption>{{ t('dashboard.stats.quality.title') }}</caption>
        <thead><tr><th scope="col">{{ t('dashboard.stats.ad') }}</th><th scope="col">{{ t('dashboard.stats.quality.score') }}</th><th scope="col">{{ t('dashboard.stats.quality.status') }}</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <th scope="row">{{ row.title }}</th>
            <td>{{ fmt(row.total) }} / 10</td>
            <td>{{ row.belowThreshold ? t('job.list.belowThreshold') : t('dashboard.stats.quality.above') }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </StatCard>
</template>
