<script setup lang="ts">
import type { PipelineDto } from '@candydati/domain'
import { usePreferredReducedMotion } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { originLabel, originText } from '@/lib/origin-label'
import type { TrackedLinkDto } from '@/lib/tracked-link-api'
import { dailySeries, filterChoices, parseSourceFilter, sourceSummaries, TRAFFIC_DAYS, trafficTotals, type FilterChoice, type TrafficDays } from '@/lib/traffic-view'

/**
 * Visits and applications of this ad day by day (PRODUCT.md §3.1, sources): the period (7, 30, 90 days), a source or saved
 * link to look at alone, the three figures, the chart, the table per source and, for the chosen source, who applied
 * through it. Visits are anonymous daily counts; the people come from the pipeline, as the board shows them.
 */
const props = defineProps<{ jobId: string; links: readonly TrackedLinkDto[]; pipeline: PipelineDto | null }>()
const { t, locale } = useI18n()
const motion = usePreferredReducedMotion()
const duration = computed(() => (motion.value === 'reduce' ? 0 : 450))
const traffic = useJobTraffic(props.jobId, () => true)
const selected = ref('')
const filter = computed(() => parseSourceFilter(selected.value))
const rows = computed(() => traffic.rows.value ?? [])
const points = computed(() => dailySeries(rows.value, filter.value, traffic.period.value, locale.value))
const totals = computed(() => trafficTotals(points.value))
const summaries = computed(() => sourceSummaries(rows.value))
const choiceLabel = (choice: FilterChoice): string => (choice.kind === 'source' ? originLabel(choice.origin, t) : originText(choice.origin, choice.campaign, t))
const options = computed(() =>
  filterChoices(summaries.value, props.links).map((choice) => ({
    value: choice.value,
    label: choiceLabel(choice),
    group: choice.kind === 'link' ? t('trackedLinks.traffic.groups.links') : t('trackedLinks.traffic.groups.sources'),
  })),
)
const periodOptions = computed(() => TRAFFIC_DAYS.map((days) => ({ value: String(days), label: t('trackedLinks.traffic.days', { count: days }) })))
const filterName = computed(() => (filter.value === null ? t('trackedLinks.traffic.all') : originText(filter.value.origin, filter.value.campaign || null, t)))
const caption = computed(() => t('trackedLinks.traffic.caption', { source: filterName.value, count: traffic.days.value }))
const setDays = (value: string): void => {
  traffic.days.value = Number(value) as TrafficDays
}
</script>

<template>
  <section class="grid gap-4 rounded-xl panel p-5 sm:p-6" aria-labelledby="job-sources-title" data-testid="job-sources">
    <div class="grid gap-1">
      <h2 id="job-sources-title" class="text-base font-semibold tracking-tight">{{ t('trackedLinks.visits.title') }}</h2>
      <p class="text-sm text-muted-foreground">{{ t('trackedLinks.visits.description') }}</p>
    </div>
    <div class="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-end">
      <div class="grid gap-1.5">
        <span class="text-xs font-medium text-muted-foreground" aria-hidden="true">{{ t('trackedLinks.traffic.period') }}</span>
        <SegmentedControl id="traffic-period" :model-value="String(traffic.days.value)" :options="periodOptions" :label="t('trackedLinks.traffic.period')" @update:model-value="setDays" />
      </div>
      <div class="grid gap-1.5">
        <label for="traffic-source" class="text-xs font-medium text-muted-foreground">{{ t('trackedLinks.traffic.source') }}</label>
        <SelectInput id="traffic-source" v-model="selected" :options="options" :placeholder="t('trackedLinks.traffic.all')" />
      </div>
    </div>
    <div v-if="traffic.errorKey.value" class="grid gap-3" data-testid="job-sources-error">
      <FormAlert :message-key="traffic.errorKey.value" />
      <div><Button variant="outline" @click="() => traffic.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="traffic.loading.value && traffic.rows.value === null" class="h-64 w-full" aria-busy="true" />
    <template v-else>
      <TrafficTiles :totals="totals" />
      <TrafficChart :points="points" :duration="duration" :caption="caption" />
      <p v-if="totals.visits === 0" class="text-xs text-muted-foreground" data-testid="sources-no-visits">{{ t('trackedLinks.traffic.noVisits') }}</p>
      <SourceTable v-if="summaries.length > 0" :summaries="summaries" :selected="selected" @select="(value) => (selected = selected === value ? '' : value)" />
      <div v-if="pipeline && filter" class="grid gap-2 border-t pt-4">
        <h3 class="text-sm font-semibold">{{ t('trackedLinks.people.title', { source: filterName }) }}</h3>
        <SourceApplications :pipeline="pipeline" :filter="filter" :job-id="jobId" />
      </div>
      <p v-else-if="pipeline" class="text-xs text-muted-foreground">{{ t('trackedLinks.people.pick') }}</p>
    </template>
  </section>
</template>
