<script setup lang="ts">
import type { ImportDetail } from '@/lib/import-item-view'
import { CircleAlertIcon, LoaderCircleIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/**
 * Step 2 "Analisi": the worker reads CVs and rows; the page polls the batch. Counts of CVs and rows
 * A failed analysis says so and that nothing was created.
 */
const props = defineProps<{ detail: ImportDetail }>()
const { t } = useI18n()
const batch = computed(() => props.detail.batch)
const failed = computed(() => batch.value.status === 'failed')
const stats = computed(() => [
  { key: 'cvs', value: batch.value.counts.cvs },
  { key: 'rows', value: batch.value.counts.rows },
])
</script>

<template>
  <section class="grid gap-6" aria-labelledby="import-analysis-title" data-testid="import-analysis-step">
    <div v-if="failed" class="grid justify-items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-5 py-5 sm:px-6" role="alert" data-testid="import-failed">
      <h2 id="import-analysis-title" class="flex items-center gap-2 text-base font-semibold text-destructive"><CircleAlertIcon class="size-4" aria-hidden="true" />{{ t('imports.analysis.failed') }}</h2>
      <p class="text-sm text-foreground">{{ t('imports.analysis.failedBody') }}</p>
      <Button as-child variant="outline" size="sm"><NuxtLink to="/app/imports">{{ t('imports.analysis.back') }}</NuxtLink></Button>
    </div>
    <div v-else class="grid gap-3 rounded-xl panel px-5 py-5 sm:px-6" role="status" aria-live="polite">
      <h2 id="import-analysis-title" class="flex items-center gap-2 text-base font-semibold tracking-tight">
        <LoaderCircleIcon class="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />{{ t('imports.analysis.title') }}
      </h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('imports.analysis.body') }}</p>
    </div>

    <dl class="grid divide-x overflow-hidden rounded-xl panel" data-testid="import-analysis-counts" :style="{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }">
      <div v-for="stat in stats" :key="stat.key" class="grid gap-1 px-5 py-4 sm:px-6">
        <dt class="text-xs text-muted-foreground">{{ t(`imports.analysis.${stat.key}`) }}</dt>
        <dd class="figure text-2xl font-semibold tracking-tight">{{ stat.value }}</dd>
      </div>
    </dl>

  </section>
</template>
