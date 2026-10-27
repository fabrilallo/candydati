<script setup lang="ts">
import type { JobStatsDto } from '@candydati/domain'
import { StackedBar } from '@unovis/ts'
import { VisAxis, VisPlotline, VisStackedBar, VisTooltip, VisXYContainer } from '@unovis/vue'
import { roleLabel } from '@/lib/role-label'
import { formatMoney } from '@/lib/job-view'
import { CHART_COLORS, compactMoney, escapeHtml, salaryView, shortTitle, type SalaryRow } from '@/lib/stats-view'

/**
 * The declared salary range of each published ad, grouped by role: a range bar from minimum to maximum (an
 * invisible offset segment carries it), with the medians of minimums and maximums as reference lines.
 */
const props = defineProps<{ salary: JobStatsDto['salary']; duration: number }>()
const { t, locale } = useI18n()
const wide = useMediaQuery('(min-width: 640px)')
const labelWidth = computed(() => (wide.value ? 150 : 90))
const view = computed(() => salaryView(props.salary))
const rows = computed(() => view.value.items)
const currency = computed(() => view.value.group?.currency ?? 'EUR')
const money = (amount: number): string => formatMoney(amount, currency.value, locale.value)
const compact = (amount: number | Date): string => (typeof amount === 'number' ? compactMoney(amount, currency.value, locale.value) : '')
const domain = computed<[number, number]>(() => {
  const mins = rows.value.map((row) => row.min)
  const maxs = rows.value.map((row) => row.max)
  const low = Math.min(...mins)
  const high = Math.max(...maxs)
  const pad = Math.max((high - low) * 0.12, high * 0.04)
  return [Math.max(0, Math.floor((low - pad) / 1000) * 1000), Math.ceil((high + pad) / 1000) * 1000]
})
const height = computed(() => Math.max(120, rows.value.length * 34 + 28))
const x = (d: SalaryRow): number => d.index
const y = [(d: SalaryRow): number => d.min, (d: SalaryRow): number => d.span]
const color = [CHART_COLORS.none, CHART_COLORS.main]
const yTick = (i: number | Date): string => (typeof i === 'number' && Number.isInteger(i) ? shortTitle(rows.value[i]?.title ?? '') : '')
const roleOf = (row: SalaryRow): string => roleLabel(row.role, row.customRole, t)
const triggers = {
  [StackedBar.selectors.bar]: (d: SalaryRow) =>
    `<div class="candydati-tip"><p class="candydati-tip-title">${escapeHtml(d.title)}</p><p>${escapeHtml(roleOf(d))}</p><p>${money(d.min)} - ${money(d.max)}</p></div>`,
}
</script>

<template>
  <StatCard id="stat-salary" :title="t('dashboard.stats.salary.title')" :hint="view.group ? t(`dashboard.stats.salary.hint.${view.group.period}`) : undefined">
    <template v-if="view.group" #figure>
      <dl class="flex flex-wrap gap-x-8 gap-y-2">
        <div class="grid gap-0.5">
          <dt class="order-2 text-xs text-muted-foreground">{{ t('dashboard.stats.salary.medianMin') }}</dt>
          <dd class="figure order-1 text-3xl font-semibold tracking-tight">{{ money(view.group.medianMin) }}</dd>
        </div>
        <div class="grid gap-0.5">
          <dt class="order-2 text-xs text-muted-foreground">{{ t('dashboard.stats.salary.medianMax') }}</dt>
          <dd class="figure order-1 text-3xl font-semibold tracking-tight">{{ money(view.group.medianMax) }}</dd>
        </div>
      </dl>
    </template>
    <div v-if="rows.length > 0" class="candydati-chart" :style="{ height: `${height}px` }" aria-hidden="true">
      <ClientOnly>
        <VisXYContainer :data="rows" :duration="duration" :height="height" :x-domain="domain" y-direction="south" :padding="{ top: 4, right: 12 }">
          <VisStackedBar :x="x" :y="y" :color="color" orientation="horizontal" :bar-max-width="10" :rounded-corners="5" :bar-padding="0.4" />
          <VisPlotline axis="x" :value="view.group?.medianMin" :line-width="1" :line-style="[3, 3]" color="var(--muted-foreground)" />
          <VisPlotline axis="x" :value="view.group?.medianMax" :line-width="1" :line-style="[3, 3]" color="var(--muted-foreground)" />
          <VisAxis type="x" :tick-format="compact" :num-ticks="4" :tick-line="false" :domain-line="false" />
          <VisAxis type="y" :tick-format="yTick" :tick-text-width="labelWidth" tick-text-fit-mode="trim" tick-text-trim-type="end" :tick-values="rows.map((row) => row.index)" :grid-line="false" :tick-line="false" :domain-line="false" />
          <VisTooltip :triggers="triggers" />
        </VisXYContainer>
        <template #fallback><div class="h-full rounded-lg bg-muted/60" /></template>
      </ClientOnly>
    </div>
    <ChartEmpty v-else :title="t('dashboard.stats.salary.emptyTitle')" :body="t('dashboard.stats.salary.emptyBody')" />
    <template v-if="rows.length > 0" #footer>
      <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span class="flex items-center gap-1.5"><span class="h-1.5 w-4 rounded-full bg-primary" aria-hidden="true" />{{ t('dashboard.stats.salary.legendRange') }}</span>
        <span class="flex items-center gap-1.5"><span class="w-4 border-t border-dashed border-muted-foreground" aria-hidden="true" />{{ t('dashboard.stats.salary.legendMedian') }}</span>
        <span v-if="view.otherCount > 0">{{ t('dashboard.stats.salary.other', view.otherCount) }}</span>
      </p>
    </template>
    <template #table>
      <table v-if="rows.length > 0">
        <caption>{{ t('dashboard.stats.salary.title') }}</caption>
        <thead><tr><th scope="col">{{ t('dashboard.stats.ad') }}</th><th scope="col">{{ t('job.fields.role') }}</th><th scope="col">{{ t('job.fields.salary.min') }}</th><th scope="col">{{ t('job.fields.salary.max') }}</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id"><th scope="row">{{ row.title }}</th><td>{{ roleOf(row) }}</td><td>{{ money(row.min) }}</td><td>{{ money(row.max) }}</td></tr>
        </tbody>
      </table>
    </template>
  </StatCard>
</template>
