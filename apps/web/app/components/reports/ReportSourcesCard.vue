<script setup lang="ts">
import { ORIGIN_DIRECT, ORIGIN_IMPORT, ORIGIN_MANUAL, type ReportsDto } from '@candydati/domain'
import { campaignRows, formatRate, hasNoVisits, NO_VALUE, sourceRows } from '@/lib/report-view'
import { conversionOf } from '@/lib/traffic-view'

/**
 * Where applications come from: per source the visits of the ad page, the applications, the conversion between the two and
 * the hires; below, the same per campaign. Counts only, as bars. Without campaigns the list is absent.
 */
const props = defineProps<{ sources: ReportsDto['sources'] | null; campaigns?: ReportsDto['campaigns'] | null }>()
const { t, locale } = useI18n()
const rows = computed(() => sourceRows(props.sources ?? []))
const campaigns = computed(() => campaignRows(props.campaigns ?? []))
const noVisits = computed(() => hasNoVisits(props.sources ?? []))
const NAMED: readonly string[] = [ORIGIN_DIRECT, ORIGIN_IMPORT, ORIGIN_MANUAL]
const label = (origin: string): string => (NAMED.includes(origin) ? t(`reports.sources.named.${origin}`) : origin)
/** "160 visite, 13 candidature ogni 100 visite"; under five visits the rate is named as missing, never a bare dash. */
const visitsLine = (row: { readonly visits: number; readonly applications: number }): string => {
  const visits = t('reports.sources.visits', row.visits)
  const conversion = conversionOf(row.applications, row.visits)
  if (conversion.state === 'no_visits') return visits
  return `${visits}, ${conversion.per100 === null ? t('reports.sources.conversionFew') : t('reports.sources.conversion', { count: conversion.per100 })}`
}
/** "3 assunzioni, tasso di assunzione 20%"; without enough applications for a rate, the hires alone. */
const hiresLine = (row: { readonly hires: number; readonly hireRate: Parameters<typeof formatRate>[0] }): string => {
  const rate = formatRate(row.hireRate, locale.value)
  return rate === NO_VALUE ? t('reports.sources.hires', row.hires) : `${t('reports.sources.hires', row.hires)}, ${t('reports.sources.hireRate', { rate })}`
}
</script>

<template>
  <StatCard id="report-sources" :title="t('reports.sources.title')" :hint="t('reports.sources.info')">
    <p v-if="!sources" class="text-sm text-muted-foreground" data-testid="section-error">{{ t('reports.sectionError') }}</p>
    <div v-else-if="rows.length > 0" class="grid gap-5">
      <ul class="grid gap-3.5" data-testid="source-rows">
        <li v-for="row in rows" :key="row.origin" class="grid gap-1" data-testid="source-row">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="min-w-0 truncate font-medium" :class="NAMED.includes(row.origin) ? '' : 'font-mono text-[0.8125rem]'">{{ label(row.origin) }}</span>
            <span class="figure shrink-0 font-semibold">{{ row.applications }}</span>
          </div>
          <div class="h-2" aria-hidden="true">
            <div class="h-full rounded-full bg-primary" :style="{ width: `${Math.max(row.width, 1)}%` }" />
          </div>
          <p class="figure text-xs text-muted-foreground" data-testid="source-visits">
            {{ visitsLine(row) }}
          </p>
          <p class="figure text-xs text-muted-foreground" data-testid="source-hires">
            {{ hiresLine(row) }}
          </p>
        </li>
      </ul>
      <p v-if="noVisits" class="text-xs text-muted-foreground" data-testid="sources-no-visits">{{ t('reports.sources.noVisits') }}</p>
      <div v-if="campaigns.length > 0" class="grid gap-2 border-t pt-4" data-testid="campaigns">
        <h3 class="text-sm font-semibold">{{ t('reports.sources.campaigns') }}</h3>
        <ul class="grid gap-2.5">
          <li v-for="row in campaigns" :key="`${row.origin}/${row.campaign}`" class="grid gap-0.5" data-testid="campaign-row">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="min-w-0 truncate font-mono text-[0.8125rem]">{{ label(row.origin) }} / {{ row.campaign }}</span>
              <span class="figure shrink-0 font-semibold">{{ row.applications }}</span>
            </div>
            <p class="figure text-xs text-muted-foreground">
              {{ visitsLine(row) }}, {{ t('reports.sources.hires', row.hires) }}
            </p>
          </li>
        </ul>
      </div>
    </div>
    <ChartEmpty v-else :title="t('reports.sources.emptyTitle')" :body="t('reports.sources.emptyBody')" />
  </StatCard>
</template>
