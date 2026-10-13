<script setup lang="ts">
import type { JobStatsDto } from '@tt/domain'
import { VisAxis, VisCrosshair, VisGroupedBar, VisTooltip, VisXYContainer } from '@unovis/vue'
import { CHART_COLORS, hasActivity, integerTick, weeklySeries, type WeekPoint } from '@/lib/stats-view'

/** Ads created and published per week over the last twelve weeks (grouped bars, crosshair tooltip). */
const props = defineProps<{ weekly: JobStatsDto['weekly']; duration: number; canCreate: boolean }>()
const { t, locale } = useI18n()
const series = computed(() => weeklySeries(props.weekly, locale.value))
const totals = computed(() => ({
  created: props.weekly.reduce((sum, week) => sum + week.created, 0),
  published: props.weekly.reduce((sum, week) => sum + week.published, 0),
}))
const active = computed(() => hasActivity(props.weekly))
const x = (d: WeekPoint): number => d.index
const y = [(d: WeekPoint): number => d.created, (d: WeekPoint): number => d.published]
const color = [CHART_COLORS.neutral, CHART_COLORS.main]
const xTick = (i: number | Date): string => (typeof i === 'number' ? (series.value[i]?.label ?? '') : '')
const tooltip = (d: WeekPoint): string =>
  `<div class="tt-tip"><p class="tt-tip-title">${t('dashboard.stats.activity.weekOf', { date: d.label })}</p>` +
  `<p><span class="tt-dot" style="background:${CHART_COLORS.neutral}"></span>${t('dashboard.stats.activity.created')} <b>${d.created}</b></p>` +
  `<p><span class="tt-dot" style="background:${CHART_COLORS.main}"></span>${t('dashboard.stats.activity.published')} <b>${d.published}</b></p></div>`
</script>

<template>
  <StatCard id="stat-activity" :title="t('dashboard.stats.activity.title')" :hint="t('dashboard.stats.activity.hint')">
    <template v-if="active" #figure>
      <div class="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div class="grid gap-0.5">
          <span class="figure text-4xl font-semibold tracking-tight">{{ totals.created }}</span>
          <span class="flex items-center gap-1.5 text-xs text-muted-foreground"><span class="size-2 rounded-[3px] bg-[var(--chart-neutral)]" aria-hidden="true" />{{ t('dashboard.stats.activity.created') }}</span>
        </div>
        <div class="grid gap-0.5">
          <span class="figure text-4xl font-semibold tracking-tight">{{ totals.published }}</span>
          <span class="flex items-center gap-1.5 text-xs text-muted-foreground"><span class="size-2 rounded-[3px] bg-primary" aria-hidden="true" />{{ t('dashboard.stats.activity.published') }}</span>
        </div>
      </div>
    </template>
    <div v-if="active" class="tt-chart h-48" aria-hidden="true">
      <ClientOnly>
        <VisXYContainer :data="series" :duration="duration" :padding="{ top: 8, right: 4 }" :height="192">
          <VisGroupedBar :x="x" :y="y" :color="color" :rounded-corners="3" :group-padding="0.3" :bar-padding="0.12" />
          <VisAxis type="x" :tick-format="xTick" :num-ticks="6" :grid-line="false" :tick-line="false" />
          <VisAxis type="y" :tick-format="integerTick" :num-ticks="3" :domain-line="false" :tick-line="false" />
          <VisCrosshair :x="x" :y="y" :color="color" :template="tooltip" />
          <VisTooltip />
        </VisXYContainer>
        <template #fallback><div class="h-48 rounded-lg bg-muted/60" /></template>
      </ClientOnly>
    </div>
    <ChartEmpty v-else :title="t('dashboard.stats.activity.emptyTitle')" :body="t('dashboard.stats.activity.emptyBody')" :to="canCreate ? '/app/jobs/new' : null" :cta="t('dashboard.newJob')" />
    <template #table>
      <table>
        <caption>{{ t('dashboard.stats.activity.title') }}</caption>
        <thead><tr><th scope="col">{{ t('dashboard.stats.activity.week') }}</th><th scope="col">{{ t('dashboard.stats.activity.created') }}</th><th scope="col">{{ t('dashboard.stats.activity.published') }}</th></tr></thead>
        <tbody><tr v-for="point in series" :key="point.index"><th scope="row">{{ point.label }}</th><td>{{ point.created }}</td><td>{{ point.published }}</td></tr></tbody>
      </table>
    </template>
  </StatCard>
</template>
