<script setup lang="ts">
import { REPORT_MIN_SAMPLE } from '@candydati/domain'
import { NO_VALUE } from '@/lib/report-view'
import type { TrafficTotals } from '@/lib/traffic-view'

/**
 * The three figures above the chart: visits, applications and applications per 100 visits. The rate is shown only from
 * the fifth visit, and the tile says in words why it is missing; the dots are the legend of the chart.
 */
const props = defineProps<{ totals: TrafficTotals }>()
const { t } = useI18n()
const conversionNote = computed(() => {
  const { conversion, visits, applications } = props.totals
  if (conversion.state === 'no_visits') return t('trackedLinks.traffic.conversion.noVisits')
  if (conversion.state === 'few_visits') return t('trackedLinks.traffic.conversion.fewVisits', { min: REPORT_MIN_SAMPLE, count: visits }, visits)
  return t('trackedLinks.traffic.conversion.explain', { applications, visits })
})
</script>

<template>
  <dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3" data-testid="traffic-tiles">
    <div class="grid content-start gap-0.5">
      <dt class="order-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span class="size-2 rounded-[3px] bg-[var(--chart-neutral)]" aria-hidden="true" />{{ t('trackedLinks.traffic.visits') }}
      </dt>
      <dd class="figure order-1 text-3xl font-semibold tracking-tight" data-testid="traffic-visits">{{ totals.visits }}</dd>
    </div>
    <div class="grid content-start gap-0.5">
      <dt class="order-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span class="size-2 rounded-[3px] bg-primary" aria-hidden="true" />{{ t('trackedLinks.traffic.applications') }}
      </dt>
      <dd class="figure order-1 text-3xl font-semibold tracking-tight" data-testid="traffic-applications">{{ totals.applications }}</dd>
    </div>
    <div class="col-span-2 grid content-start gap-0.5 sm:col-span-1">
      <dt class="order-2 text-xs text-muted-foreground">{{ t('trackedLinks.traffic.conversion.label') }}</dt>
      <dd class="figure order-1 text-3xl font-semibold tracking-tight" data-testid="traffic-conversion">{{ totals.conversion.per100 ?? NO_VALUE }}</dd>
      <dd class="order-3 text-xs text-muted-foreground" data-testid="traffic-conversion-note">{{ conversionNote }}</dd>
    </div>
  </dl>
</template>
