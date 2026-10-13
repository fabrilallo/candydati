<script setup lang="ts">
import type { ImportBatchDto } from '@tt/domain'
import { CircleCheckIcon, LoaderCircleIcon, Undo2Icon } from '@lucide/vue'
import { formatDateTime } from '@/lib/format'
import { batchFigures } from '@/lib/import-view'
import { Button } from '@/components/ui/button'

/** After "Importa": a notice while the worker creates the candidates, then the result with the way to the pipeline. */
const props = defineProps<{ batch: ImportBatchDto }>()
const { t, locale } = useI18n()
const pipeline = computed(() => (props.batch.jobId ? `/app/jobs/${encodeURIComponent(props.batch.jobId)}/candidates` : null))
const lines = computed(() => {
  const figures = batchFigures(props.batch.counts)
  return [
    { key: 'created', value: figures.created },
    { key: 'merged', value: figures.merged },
    { key: 'excluded', value: figures.excluded },
  ]
})
</script>

<template>
  <section class="grid gap-6" aria-labelledby="import-result-title" data-testid="import-result-step" :data-status="batch.status">
    <div v-if="batch.status === 'importing'" class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" role="status" aria-live="polite">
      <h2 id="import-result-title" class="flex items-center gap-2 text-base font-semibold tracking-tight">
        <LoaderCircleIcon class="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />{{ t('imports.result.importing') }}
      </h2>
      <p class="text-sm text-muted-foreground">{{ t('imports.result.importingBody') }}</p>
    </div>

    <div v-else-if="batch.status === 'undone'" class="grid gap-2 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6">
      <h2 id="import-result-title" class="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Undo2Icon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('imports.result.undone', { date: batch.undoneAt ? formatDateTime(batch.undoneAt, locale) : '' }) }}
      </h2>
      <p class="text-sm text-muted-foreground">{{ t('imports.result.undoneBody') }}</p>
    </div>

    <div v-else class="grid gap-4 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6">
      <div class="grid gap-1">
        <h2 id="import-result-title" class="flex items-center gap-2 text-base font-semibold tracking-tight text-success">
          <CircleCheckIcon class="size-4" aria-hidden="true" />{{ t('imports.result.done') }}
        </h2>
        <p class="text-sm text-muted-foreground">{{ t('imports.result.doneBody') }}</p>
      </div>
      <ul class="grid gap-1 text-sm" data-testid="result-counts">
        <li v-for="line in lines" :key="line.key" class="figure">{{ t(`imports.confirm.${line.key}`, { count: line.value }, line.value) }}</li>
      </ul>
    </div>

    <div class="flex flex-wrap justify-between gap-2 border-t pt-6">
      <Button as-child variant="outline"><NuxtLink to="/app/imports">{{ t('imports.result.backToList') }}</NuxtLink></Button>
      <Button v-if="pipeline && batch.status === 'done'" as-child data-testid="result-pipeline"><NuxtLink :to="pipeline">{{ t('imports.result.openPipeline') }}</NuxtLink></Button>
    </div>
  </section>
</template>
