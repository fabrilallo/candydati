<script setup lang="ts">
import { ORIGIN_DIRECT, ORIGIN_IMPORT, ORIGIN_MANUAL, type ReportsDto } from '@candydati/domain'
import { campaignRows, formatRate, hasNoVisits, sourceRows } from '@/lib/report-view'

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
            {{ t('reports.sources.visits', row.visits) }}, {{ t('reports.sources.conversion', { rate: formatRate(row.conversionRate, locale) }) }}
          </p>
          <p class="figure text-xs text-muted-foreground" data-testid="source-hires">
            {{ t('reports.sources.hires', row.hires) }}, {{ t('reports.sources.hireRate', { rate: formatRate(row.hireRate, locale) }) }}
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
              {{ t('reports.sources.visits', row.visits) }}, {{ t('reports.sources.conversion', { rate: formatRate(row.conversionRate, locale) }) }}, {{ t('reports.sources.hires', row.hires) }}
            </p>
          </li>
        </ul>
      </div>
    </div>
    <ChartEmpty v-else :title="t('reports.sources.emptyTitle')" :body="t('reports.sources.emptyBody')" />
  </StatCard>
</template>
