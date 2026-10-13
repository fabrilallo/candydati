<script setup lang="ts">
import { ORIGIN_DIRECT, ORIGIN_IMPORT, ORIGIN_MANUAL, type ReportsDto } from '@tt/domain'
import { formatRate, sourceRows } from '@/lib/report-view'

/** Applications by origin as a short ranked list with HTML bars, and the hires each origin led to. */
const props = defineProps<{ sources: ReportsDto['sources'] | null }>()
const { t, locale } = useI18n()
const rows = computed(() => sourceRows(props.sources ?? []))
const NAMED: readonly string[] = [ORIGIN_DIRECT, ORIGIN_IMPORT, ORIGIN_MANUAL]
const label = (origin: string): string => (NAMED.includes(origin) ? t(`reports.sources.named.${origin}`) : origin)
</script>

<template>
  <StatCard id="report-sources" :title="t('reports.sources.title')" :hint="t('reports.sources.info')">
    <p v-if="!sources" class="text-sm text-muted-foreground" data-testid="section-error">{{ t('reports.sectionError') }}</p>
    <ul v-else-if="rows.length > 0" class="grid gap-3.5" data-testid="source-rows">
      <li v-for="row in rows" :key="row.origin" class="grid gap-1" data-testid="source-row">
        <div class="flex items-baseline justify-between gap-3 text-sm">
          <span class="min-w-0 truncate font-medium" :class="NAMED.includes(row.origin) ? '' : 'font-mono text-[0.8125rem]'">{{ label(row.origin) }}</span>
          <span class="figure shrink-0 font-semibold">{{ row.applications }}</span>
        </div>
        <div class="h-2" aria-hidden="true">
          <div class="h-full rounded-full bg-primary" :style="{ width: `${Math.max(row.width, 1)}%` }" />
        </div>
        <p class="figure text-xs text-muted-foreground" data-testid="source-hires">
          {{ t('reports.sources.hires', row.hires) }}, {{ t('reports.sources.hireRate', { rate: formatRate(row.hireRate, locale) }) }}
        </p>
      </li>
    </ul>
    <ChartEmpty v-else :title="t('reports.sources.emptyTitle')" :body="t('reports.sources.emptyBody')" />
  </StatCard>
</template>
