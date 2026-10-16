<script setup lang="ts">
import type { ReportsView } from '@candydati/domain'
import { formatDaysValue, NO_VALUE, timeRows } from '@/lib/report-view'

/**
 * Time to hire (median and 75th percentile) and time to fill per job. A table, readable as is, with a dot plot on a
 * shared scale from `sm` (decorative: the numbers are in the cells).
 */
const props = defineProps<{ report: Pick<ReportsView, 'timeToHire' | 'timeToFill'> }>()
const { t, locale } = useI18n()
const view = computed(() => timeRows(props.report))
const days = (value: number | null): string => (value === null ? NO_VALUE : formatDaysValue(value, locale.value))
const fill = computed(() => props.report.timeToFill?.overall ?? null)
const failed = computed(() => props.report.timeToHire === null || props.report.timeToFill === null)
</script>

<template>
  <StatCard id="report-times" :title="t('reports.times.title')" :hint="t('reports.times.info')">
    <template v-if="fill && fill.median !== null" #figure>
      <p class="flex flex-wrap items-baseline gap-x-1.5 gap-y-1" data-testid="time-to-fill">
        <span class="figure text-3xl font-semibold tracking-tight">{{ days(fill.median) }}</span>
        <span class="text-sm text-muted-foreground">{{ t('reports.times.fillMedian', Math.round(fill.median)) }}</span>
        <span class="figure text-xs text-muted-foreground">({{ t('reports.times.fillBasis', fill.count) }})</span>
      </p>
    </template>
    <p v-if="failed && view.rows.length === 0" class="text-sm text-muted-foreground" data-testid="section-error">{{ t('reports.sectionError') }}</p>
    <div v-else-if="view.rows.length > 0" class="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
      <table class="w-full min-w-[30rem] text-sm" data-testid="time-table">
        <caption class="sr-only">{{ t('reports.times.title') }}</caption>
        <thead>
          <tr class="border-b text-left text-xs whitespace-nowrap text-muted-foreground">
            <th scope="col" class="py-2 pr-3 font-medium">{{ t('reports.times.job') }}</th>
            <th scope="col" class="px-2 py-2 text-right font-medium">{{ t('reports.times.hires') }}</th>
            <th scope="col" class="px-2 py-2 text-right font-medium">{{ t('reports.times.median') }}</th>
            <th scope="col" class="px-2 py-2 text-right font-medium">{{ t('reports.times.p75') }}</th>
            <th scope="col" class="px-2 py-2 text-right font-medium">{{ t('reports.times.fill') }}</th>
            <th scope="col" class="hidden w-[32%] py-2 pl-3 sm:table-cell"><span class="sr-only">{{ t('reports.times.scale') }}</span></th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="row in view.rows" :key="row.jobId" data-testid="time-row">
            <th scope="row" class="max-w-48 truncate py-3 pr-3 text-left font-medium">{{ row.title }}</th>
            <td class="figure px-2 py-3 text-right">{{ row.hires }}</td>
            <td class="figure px-2 py-3 text-right font-semibold">{{ days(row.medianDays) }}</td>
            <td class="figure px-2 py-3 text-right">{{ days(row.p75Days) }}</td>
            <td class="figure px-2 py-3 text-right">{{ days(row.fillDays) }}</td>
            <td class="hidden py-3 pl-3 sm:table-cell" aria-hidden="true">
              <div class="relative h-3">
                <span v-if="row.fillAt !== null" class="absolute top-1/2 size-2.5 -translate-1/2 rotate-45 rounded-[2px] bg-(--chart-neutral)" :style="{ left: `${row.fillAt}%` }" />
                <span v-if="row.p75At !== null" class="absolute top-1/2 size-2.5 -translate-1/2 rounded-full border-2 border-primary bg-card" :style="{ left: `${row.p75At}%` }" />
                <span v-if="row.medianAt !== null" class="absolute top-1/2 size-2.5 -translate-1/2 rounded-full bg-primary" :style="{ left: `${row.medianAt}%` }" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ChartEmpty v-else :title="t('reports.times.emptyTitle')" :body="t('reports.times.emptyBody')" />
    <template v-if="view.rows.length > 0" #footer>
      <ul class="hidden flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:flex" aria-hidden="true">
        <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-primary" />{{ t('reports.times.median') }}</li>
        <li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full border-2 border-primary" />{{ t('reports.times.p75') }}</li>
        <li class="flex items-center gap-1.5"><span class="size-2.5 rotate-45 rounded-[2px] bg-(--chart-neutral)" />{{ t('reports.times.fill') }}</li>
        <li class="figure ml-auto">{{ t('reports.times.scaleMax', { days: days(view.max) }) }}</li>
      </ul>
    </template>
  </StatCard>
</template>
