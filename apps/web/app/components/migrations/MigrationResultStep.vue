<script setup lang="ts">
import type { MigrationBatchDto } from '@candydati/domain'
import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon, Undo2Icon } from '@lucide/vue'
import { formatDateTime } from '@/lib/format'
import { failureKey } from '@/lib/migration-view'
import { Button } from '@/components/ui/button'

/**
 * After "Confirm and migrate": a notice while the worker writes, then what was written (and the way to the jobs and the
 * candidates), or why it stopped, and the undo. After an undo, what it erased and what it kept.
 */
const props = defineProps<{ batch: MigrationBatchDto; undoPending: boolean }>()
const emit = defineEmits<{ undo: [] }>()
const { t, locale } = useI18n()
const COMMIT_LINES = ['jobs', 'candidatesCreated', 'candidatesMerged', 'applications', 'cvs', 'stageEvents', 'notes', 'messages', 'reconfirmationsQueued', 'skippedAlreadyApplied'] as const
const written = computed(() => COMMIT_LINES.flatMap((key) => {
  const value = props.batch.counts.commit?.[key] ?? 0
  return value > 0 ? [{ key, value }] : []
}))
const erased = computed(() => {
  const undo = props.batch.counts.undo
  if (!undo) return []
  return [
    { key: 'undoneCounts', value: undo.candidatesErased },
    { key: 'undoneKept', value: undo.keptReconfirmed + undo.keptAppliedAgain },
    { key: 'undoneJobs', value: undo.jobsDeleted },
    { key: 'undoneJobsKept', value: undo.jobsKept },
    { key: 'undoneFailed', value: undo.failed },
  ].filter((line) => line.value > 0)
})
const canUndo = computed(() => props.batch.status === 'done' || (props.batch.status === 'failed' && props.batch.counts.commit !== undefined))
</script>

<template>
  <section class="grid gap-6" aria-labelledby="migration-result-title" data-testid="migration-result-step" :data-status="batch.status">
    <div v-if="batch.status === 'importing'" class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" role="status" aria-live="polite">
      <h2 id="migration-result-title" class="flex items-center gap-2 text-base font-semibold tracking-tight">
        <LoaderCircleIcon class="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />{{ t('migrations.result.importing') }}
      </h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.result.importingBody') }}</p>
    </div>

    <div v-else-if="batch.status === 'undone'" class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6">
      <div class="grid gap-1">
        <h2 id="migration-result-title" class="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Undo2Icon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('migrations.result.undone', { date: batch.undoneAt ? formatDateTime(batch.undoneAt, locale) : '' }) }}
        </h2>
        <p class="text-sm text-muted-foreground">{{ t('migrations.result.undoneBody') }}</p>
      </div>
      <ul v-if="erased.length > 0" class="grid gap-1 text-sm" data-testid="undo-counts">
        <li v-for="line in erased" :key="line.key" class="figure">{{ t(`migrations.result.${line.key}`, { count: line.value }, line.value) }}</li>
      </ul>
    </div>

    <div v-else-if="batch.status === 'failed'" class="grid gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-5 py-5 sm:px-6" role="alert" data-testid="migration-stopped">
      <h2 id="migration-result-title" class="flex items-center gap-2 text-base font-semibold text-destructive"><CircleAlertIcon class="size-4" aria-hidden="true" />{{ t('migrations.result.failed') }}</h2>
      <p class="text-sm text-foreground">{{ t('migrations.result.failedBody') }}</p>
      <p v-if="batch.error" class="text-sm text-foreground">{{ t('migrations.analysis.reason', { reason: t(failureKey(batch.error)) }) }}</p>
    </div>

    <div v-else class="grid gap-4 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6">
      <div class="grid gap-1">
        <h2 id="migration-result-title" class="flex items-center gap-2 text-base font-semibold tracking-tight text-success">
          <CircleCheckIcon class="size-4" aria-hidden="true" />{{ t('migrations.result.done') }}
        </h2>
        <p class="text-sm text-muted-foreground">{{ t('migrations.result.doneBody') }}</p>
      </div>
      <ul class="grid gap-1 text-sm" data-testid="migration-written">
        <li v-for="line in written" :key="line.key" class="figure" :data-line="line.key">{{ t(`migrations.result.counts.${line.key}`, { count: line.value }, line.value) }}</li>
      </ul>
    </div>

    <div v-if="batch.status === 'failed' && written.length > 0" class="grid gap-1 rounded-xl border bg-card px-5 py-4 shadow-xs sm:px-6">
      <ul class="grid gap-1 text-sm" data-testid="migration-written">
        <li v-for="line in written" :key="line.key" class="figure" :data-line="line.key">{{ t(`migrations.result.counts.${line.key}`, { count: line.value }, line.value) }}</li>
      </ul>
    </div>

    <div class="flex flex-wrap justify-between gap-2 border-t pt-6">
      <div class="flex flex-wrap gap-2">
        <Button as-child variant="outline"><NuxtLink to="/app/migrations">{{ t('migrations.result.backToList') }}</NuxtLink></Button>
        <Button v-if="canUndo" type="button" variant="ghost" class="text-destructive hover:text-destructive" :disabled="undoPending" data-testid="migration-undo" @click="emit('undo')"><Undo2Icon aria-hidden="true" />{{ t('migrations.result.undo') }}</Button>
      </div>
      <div v-if="batch.status === 'done'" class="flex flex-wrap gap-2">
        <Button as-child variant="outline"><NuxtLink to="/app/candidates" data-testid="migration-open-candidates">{{ t('migrations.result.openCandidates') }}</NuxtLink></Button>
        <Button as-child data-testid="migration-open-jobs"><NuxtLink to="/app/jobs">{{ t('migrations.result.openJobs') }}</NuxtLink></Button>
      </div>
    </div>
  </section>
</template>
