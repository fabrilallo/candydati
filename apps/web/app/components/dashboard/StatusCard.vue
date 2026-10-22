<script setup lang="ts">
import type { JobStatsDto, JobStatus } from '@candydati/domain'
import { Donut } from '@unovis/ts'
import { VisDonut, VisSingleContainer, VisTooltip } from '@unovis/vue'
import { CHART_COLORS, statusSlices } from '@/lib/stats-view'

/** Ads by status: a donut with the total in the middle and a legend with counts and shares. */
const props = defineProps<{ counts: JobStatsDto['statusCounts']; duration: number }>()
const { t } = useI18n()
type Slice = { readonly status: JobStatus; readonly value: number }
const slices = computed(() => statusSlices(props.counts))
const share = (value: number): string => (props.counts.total === 0 ? '0%' : `${Math.round((value / props.counts.total) * 100)}%`)
const color = (slice: Slice): string => CHART_COLORS[slice.status]
const value = (slice: Slice): number => slice.value
const triggers = { [Donut.selectors.segment]: (d: { data: Slice }) => `${t(`dashboard.counts.${d.data.status}`)}: <b>${d.data.value}</b>` }
const dot = { published: 'bg-success', draft: 'bg-[var(--chart-neutral)]', closed: 'bg-input' } as const
</script>

<template>
  <StatCard id="stat-status" :title="t('dashboard.stats.status.title')">
    <template #action>
      <NuxtLink to="/app/jobs" class="shrink-0 text-sm font-medium text-link underline-offset-4 hover:underline">{{ t('dashboard.stats.status.all') }}</NuxtLink>
    </template>
    <div class="grid h-full grid-cols-[7rem_minmax(0,1fr)] content-center items-center gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] xl:grid-cols-[11.5rem_minmax(0,1fr)] xl:gap-7">
      <div class="candydati-chart aspect-square" aria-hidden="true">
        <ClientOnly>
          <VisSingleContainer :data="slices" :duration="duration" class="size-full">
            <VisTooltip :triggers="triggers" />
            <VisDonut
              :value="value"
              :color="color"
              :arc-width="14"
              :corner-radius="4"
              :pad-angle="0.03"
              :show-background="true"
              :central-label="String(counts.total)"
              :central-sub-label="t('dashboard.stats.status.unit', counts.total)"
            />
          </VisSingleContainer>
          <template #fallback><div class="size-full rounded-full border-[14px] border-muted" /></template>
        </ClientOnly>
      </div>
      <dl class="grid gap-3">
        <div v-for="slice in slices" :key="slice.status" class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5" :data-testid="`count-${slice.status}`">
          <span class="size-2.5 rounded-full" :class="dot[slice.status]" aria-hidden="true" />
          <dt class="truncate text-sm text-muted-foreground">{{ t(`dashboard.counts.${slice.status}`) }}</dt>
          <dd class="flex items-baseline gap-2">
            <span class="figure text-lg font-semibold tracking-tight" data-testid="count-value">{{ slice.value }}</span>
            <span class="figure w-9 text-right text-xs text-muted-foreground">{{ share(slice.value) }}</span>
          </dd>
        </div>
      </dl>
    </div>
  </StatCard>
</template>
