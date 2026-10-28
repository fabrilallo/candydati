<script setup lang="ts">
import { VisAxis, VisCrosshair, VisStackedBar, VisTooltip, VisXYContainer } from '@unovis/vue'
import { CHART_COLORS, escapeHtml, integerTick } from '@/lib/stats-view'
import type { DayPoint } from '@/lib/traffic-view'

/**
 * Visits and applications per day, one column per day: visits as a wide light bar, applications as a narrow dark bar
 * inside it, on the same scale, so both stay readable however far apart they are. The text alternative is the table
 * below the chart (screen readers only); the legend is in the tiles above.
 */
const props = defineProps<{ points: readonly DayPoint[]; duration: number; caption: string }>()
const { t } = useI18n()
const wide = useMediaQuery('(min-width: 640px)')
const height = 200
const x = (d: DayPoint): number => d.index
const visits = (d: DayPoint): number => d.visits
const applications = (d: DayPoint): number => d.applications
const top = computed(() => Math.max(4, ...props.points.map((point) => Math.max(point.visits, point.applications))))
const xTick = (i: number | Date): string => (typeof i === 'number' ? (props.points[i]?.label ?? '') : '')
const tooltip = (d: DayPoint): string =>
  `<div class="candydati-tip"><p class="candydati-tip-title">${escapeHtml(d.label)}</p>` +
  `<p><span class="candydati-dot" style="background:${CHART_COLORS.neutral}"></span>${t('trackedLinks.traffic.visits')} <b>${d.visits}</b></p>` +
  `<p><span class="candydati-dot" style="background:${CHART_COLORS.main}"></span>${t('trackedLinks.traffic.applications')} <b>${d.applications}</b></p></div>`
</script>

<template>
  <div class="grid gap-2">
    <div class="candydati-chart" :style="{ height: `${height}px` }" aria-hidden="true" data-testid="traffic-chart">
      <ClientOnly>
        <VisXYContainer :data="points" :duration="duration" :height="height" :y-domain="[0, top]" :padding="{ top: 8, right: 4 }">
          <VisStackedBar :x="x" :y="visits" :color="CHART_COLORS.neutral" :rounded-corners="2" :bar-padding="0.12" />
          <VisStackedBar :x="x" :y="applications" :color="CHART_COLORS.main" :rounded-corners="2" :bar-padding="0.5" />
          <VisAxis type="x" :tick-format="xTick" :num-ticks="wide ? 7 : 4" :grid-line="false" :tick-line="false" />
          <VisAxis type="y" :tick-format="integerTick" :num-ticks="3" :domain-line="false" :tick-line="false" />
          <VisCrosshair :x="x" :y="[visits, applications]" :color="[CHART_COLORS.neutral, CHART_COLORS.main]" :template="tooltip" />
          <VisTooltip />
        </VisXYContainer>
        <template #fallback><div class="h-full rounded-lg bg-muted/60" /></template>
      </ClientOnly>
    </div>
    <div class="sr-only">
      <table data-testid="traffic-table">
        <caption>{{ caption }}</caption>
        <thead><tr><th scope="col">{{ t('trackedLinks.traffic.day') }}</th><th scope="col">{{ t('trackedLinks.traffic.visits') }}</th><th scope="col">{{ t('trackedLinks.traffic.applications') }}</th></tr></thead>
        <tbody>
          <tr v-for="point in points.filter((p) => p.visits > 0 || p.applications > 0)" :key="point.day"><th scope="row">{{ point.label }}</th><td>{{ point.visits }}</td><td>{{ point.applications }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
