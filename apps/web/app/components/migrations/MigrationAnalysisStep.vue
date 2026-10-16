<script setup lang="ts">
import type { MigrationBatchDto } from '@candydati/domain'
import { CircleAlertIcon, LoaderCircleIcon } from '@lucide/vue'
import { failureKey } from '@/lib/migration-view'
import { Button } from '@/components/ui/button'

/**
 * Step 3 "Analysis": the worker opens the package and prepares the preview; the page polls the migration. A failed
 * analysis says why, in plain words, and that nothing was written.
 */
const props = defineProps<{ batch: MigrationBatchDto }>()
const { t } = useI18n()
const failed = computed(() => props.batch.status === 'failed')
const reason = computed(() => t(failureKey(props.batch.error)))
</script>

<template>
  <section class="grid gap-6" aria-labelledby="migration-analysis-title" data-testid="migration-analysis-step">
    <div v-if="failed" class="grid justify-items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-5 py-5 sm:px-6" role="alert" data-testid="migration-failed">
      <h2 id="migration-analysis-title" class="flex items-center gap-2 text-base font-semibold text-destructive"><CircleAlertIcon class="size-4" aria-hidden="true" />{{ t('migrations.analysis.failed') }}</h2>
      <p class="text-sm text-foreground">{{ t('migrations.analysis.failedBody') }}</p>
      <p class="text-sm text-foreground" data-testid="migration-failure-reason">{{ t('migrations.analysis.reason', { reason }) }}</p>
      <Button as-child variant="outline" size="sm"><NuxtLink to="/app/migrations">{{ t('migrations.analysis.back') }}</NuxtLink></Button>
    </div>
    <div v-else class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" role="status" aria-live="polite">
      <h2 id="migration-analysis-title" class="flex items-center gap-2 text-base font-semibold tracking-tight">
        <LoaderCircleIcon class="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />{{ t('migrations.analysis.title') }}
      </h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.analysis.body') }}</p>
    </div>
  </section>
</template>
