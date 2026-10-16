<script setup lang="ts">
import type { MigrationBatchDto } from '@candydati/domain'
import { LoaderCircleIcon } from '@lucide/vue'
import { fetchProgress } from '@/lib/migration-fetch'

/**
 * A connector reading the source: how much is read, as a share once the source has said how much there is, as a count
 * before. The page polls the migration; when the reading ends the analysis takes over.
 */
const props = defineProps<{ batch: MigrationBatchDto }>()
const { t, n } = useI18n()
const connectors = useMigrationConnectors()
const progress = computed(() => fetchProgress(props.batch.counts))
const source = computed(() => connectors.labelOf(props.batch.sourceSystem))
</script>

<template>
  <div class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" role="status" aria-live="polite" data-testid="migration-fetching">
    <h2 id="migration-analysis-title" class="flex items-center gap-2 text-base font-semibold tracking-tight">
      <LoaderCircleIcon class="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />{{ t('migrations.analysis.fetchingTitle', { source }) }}
    </h2>
    <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.analysis.fetchingBody') }}</p>
    <p class="figure text-sm font-medium" data-testid="migration-fetch-count">
      {{ progress.total === null ? t('migrations.analysis.fetchingCount', { done: n(progress.done) }) : t('migrations.analysis.fetchingProgress', { done: n(progress.done), total: n(progress.total) }) }}
    </p>
    <div
      class="h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      :aria-valuenow="progress.percent ?? undefined"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="t('migrations.analysis.fetchingTitle', { source })"
      data-testid="migration-fetch-bar"
    >
      <div v-if="progress.percent !== null" class="h-full rounded-full bg-primary transition-[width] duration-150 ease-snap motion-reduce:transition-none" :style="{ width: `${progress.percent}%` }" />
      <div v-else class="h-full w-1/3 animate-pulse rounded-full bg-primary/60 motion-reduce:animate-none" />
    </div>
  </div>
</template>
