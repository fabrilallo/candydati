<script setup lang="ts">
import type { ReportsView } from '@candydati/domain'
import { formatDaysValue, formatRate, headlines, NO_VALUE } from '@/lib/report-view'

/** The four figures that matter most, in one divided panel: each with its basis and one plain sentence. */
const props = defineProps<{ report: ReportsView }>()
const { t, locale } = useI18n()
const items = computed(() => {
  const view = headlines(props.report)
  const median = view.timeToHire?.median ?? null
  return [
    {
      id: 'time-to-hire',
      label: t('reports.headlines.timeToHire.label'),
      value: median === null ? NO_VALUE : formatDaysValue(median, locale.value),
      unit: median === null ? '' : t('reports.days', Math.round(median)),
      basis: view.timeToHire ? t('reports.headlines.timeToHire.basis', view.timeToHire.count) : '',
      info: t('reports.headlines.timeToHire.info'),
    },
    {
      id: 'responses',
      label: t('reports.headlines.responses.label'),
      value: view.responses ? formatRate(view.responses, locale.value) : NO_VALUE,
      unit: '',
      basis: view.responses ? t('reports.basis', { count: view.responses.count, total: view.responses.total }) : '',
      info: t('reports.headlines.responses.info'),
    },
    {
      id: 'coverage',
      label: t('reports.headlines.coverage.label'),
      value: view.coverage ? formatRate(view.coverage, locale.value) : NO_VALUE,
      unit: '',
      basis: view.coverage ? t('reports.basis', { count: view.coverage.count, total: view.coverage.total }) : '',
      info: t('reports.headlines.coverage.info'),
    },
    {
      id: 'received',
      label: t('reports.headlines.received.label'),
      value: view.received === null ? NO_VALUE : new Intl.NumberFormat(locale.value === 'it' ? 'it-IT' : 'en-GB').format(view.received),
      unit: '',
      basis: '',
      info: t('reports.headlines.received.info'),
    },
  ]
})
</script>

<template>
  <section :aria-label="t('reports.headlines.title')" class="rounded-xl panel" data-testid="report-headlines">
    <dl class="grid divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
      <div
        v-for="(item, index) in items"
        :key="item.id"
        class="grid content-start gap-1 px-5 py-5 sm:px-6"
        :class="[index >= 2 ? 'sm:border-t lg:border-t-0' : '', index % 2 === 1 ? 'sm:border-l lg:border-l-0' : '']"
        :data-testid="`headline-${item.id}`"
      >
        <dt class="text-sm font-medium">{{ item.label }}</dt>
        <dd class="grid gap-1">
          <p class="flex items-baseline gap-1.5">
            <span class="figure text-4xl font-semibold tracking-tight" data-testid="headline-value">{{ item.value }}</span>
            <span v-if="item.unit" class="text-sm text-muted-foreground">{{ item.unit }}</span>
          </p>
          <p v-if="item.basis" class="figure text-xs text-muted-foreground" data-testid="headline-basis">{{ item.basis }}</p>
          <p class="mt-1 text-xs text-pretty text-muted-foreground">{{ item.info }}</p>
        </dd>
      </div>
    </dl>
  </section>
</template>
