<script setup lang="ts">
import { CircleAlertIcon, LoaderCircleIcon } from '@lucide/vue'
import { ignoredReasonKey, progressPercent } from '@/lib/import-view'
import type { ImportDetailDto } from '@/lib/phase8-contract'
import { Button } from '@/components/ui/button'

/**
 * Step 2 "Analisi": the worker reads CVs and rows; the page polls the batch. Counts of CVs, rows and ignored files
 * with the reason for each. A failed analysis says so and that nothing was created.
 */
const props = defineProps<{ detail: ImportDetailDto }>()
const { t } = useI18n()
const batch = computed(() => props.detail.batch)
const failed = computed(() => batch.value.status === 'failed')
const percent = computed(() => progressPercent(batch.value.progress))
const ignored = computed(() => Math.max(batch.value.counts.ignored, batch.value.ignored.length))
const stats = computed(() => [
  { key: 'cvs', value: batch.value.counts.cvs },
  { key: 'rows', value: batch.value.counts.rows },
  ...(ignored.value > 0 ? [{ key: 'ignored', value: ignored.value }] : []),
])
</script>

<template>
  <section class="grid gap-6" aria-labelledby="import-analysis-title" data-testid="import-analysis-step">
    <div v-if="failed" class="grid justify-items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-5 py-5 sm:px-6" role="alert" data-testid="import-failed">
      <h2 id="import-analysis-title" class="flex items-center gap-2 text-base font-semibold text-destructive"><CircleAlertIcon class="size-4" aria-hidden="true" />{{ t('imports.analysis.failed') }}</h2>
      <p class="text-sm text-foreground">{{ t('imports.analysis.failedBody') }}</p>
      <Button as-child variant="outline" size="sm"><NuxtLink to="/app/imports">{{ t('imports.analysis.back') }}</NuxtLink></Button>
    </div>
    <div v-else class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" role="status" aria-live="polite">
      <h2 id="import-analysis-title" class="flex items-center gap-2 text-base font-semibold tracking-tight">
        <LoaderCircleIcon class="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />{{ t('imports.analysis.title') }}
      </h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('imports.analysis.body') }}</p>
      <div v-if="batch.progress && percent !== null" class="grid gap-1.5" data-testid="import-analysis-progress">
        <div class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div class="h-full rounded-full bg-primary transition-[width] duration-300 ease-snap" :style="{ width: `${percent}%` }" />
        </div>
        <p class="figure text-xs text-muted-foreground">{{ t('imports.analysis.progress', { done: batch.progress.done, total: batch.progress.total }) }}</p>
      </div>
    </div>

    <dl class="grid divide-x overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="import-analysis-counts" :style="{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }">
      <div v-for="stat in stats" :key="stat.key" class="grid gap-1 px-5 py-4 sm:px-6">
        <dt class="text-xs text-muted-foreground">{{ t(`imports.analysis.${stat.key}`) }}</dt>
        <dd class="figure text-2xl font-semibold tracking-tight">{{ stat.value }}</dd>
      </div>
    </dl>

    <section v-if="batch.ignored.length > 0" class="grid gap-2" aria-labelledby="import-ignored-title">
      <h3 id="import-ignored-title" class="text-sm font-semibold">{{ t('imports.analysis.ignoredTitle') }}</h3>
      <ul class="divide-y rounded-xl border bg-card text-sm" data-testid="import-ignored">
        <li v-for="file in batch.ignored" :key="file.name" class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-2.5 sm:px-6">
          <span class="min-w-0 truncate font-mono text-xs">{{ file.name }}</span>
          <span class="text-xs text-muted-foreground">{{ t(ignoredReasonKey(file.reason)) }}</span>
        </li>
      </ul>
    </section>
  </section>
</template>
