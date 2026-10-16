<script setup lang="ts">
import type { MigrationBatchDto } from '@candydati/domain'
import { CheckIcon, Trash2Icon } from '@lucide/vue'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Undo of a migration: exactly what goes (people the migration created with everything attached, for existing people only
 * what it added, the jobs nothing else uses) and what stays (people who confirmed or applied again, jobs in use, the
 * record itself). Esc and the overlay stay available until the call starts.
 */
const props = defineProps<{ open: boolean; batch: MigrationBatchDto | null; pending: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [] }>()
const { t, locale } = useI18n()
const commit = computed(() => props.batch?.counts.commit ?? null)
const guard = (event: Event): void => {
  if (props.pending) event.preventDefault()
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => (pending ? undefined : emit('update:open', value))">
    <DialogContent class="sm:max-w-lg" data-testid="migration-undo-dialog" @interact-outside="guard" @escape-key-down="guard">
      <DialogHeader>
        <DialogTitle>{{ t('migrations.undo.title', { date: batch ? formatDateTime(batch.createdAt, locale) : '' }) }}</DialogTitle>
        <DialogDescription>{{ t('migrations.undo.irreversible') }}</DialogDescription>
      </DialogHeader>
      <div v-if="commit" class="grid gap-4 rounded-lg border px-4 py-4">
        <section class="grid gap-2" aria-labelledby="migration-undo-deleted">
          <h3 id="migration-undo-deleted" class="text-sm font-semibold">{{ t('migrations.undo.intro') }}</h3>
          <ul class="grid gap-1.5 text-sm" data-testid="migration-undo-deleted">
            <li class="figure flex items-start gap-2"><Trash2Icon class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />{{ t('migrations.undo.people', { count: commit.candidatesCreated }, commit.candidatesCreated) }}</li>
            <li class="figure flex items-start gap-2"><Trash2Icon class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />{{ t('migrations.undo.merged', { count: commit.candidatesMerged }, commit.candidatesMerged) }}</li>
            <li class="figure flex items-start gap-2"><Trash2Icon class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />{{ t('migrations.undo.jobs', { count: commit.jobs }, commit.jobs) }}</li>
          </ul>
        </section>
        <section class="grid gap-2 border-t pt-4" aria-labelledby="migration-undo-kept">
          <h3 id="migration-undo-kept" class="text-sm font-semibold">{{ t('migrations.undo.keptTitle') }}</h3>
          <ul class="grid gap-1.5 text-sm" data-testid="migration-undo-kept">
            <li class="flex items-start gap-2"><CheckIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ t('migrations.undo.kept') }}</li>
            <li class="flex items-start gap-2"><CheckIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ t('migrations.undo.keptJobs') }}</li>
            <li class="flex items-start gap-2"><CheckIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ t('migrations.undo.record') }}</li>
          </ul>
        </section>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('migrations.undo.cancel') }}</Button>
        <Button type="button" variant="destructive" :disabled="pending" data-testid="migration-undo-confirm" @click="emit('confirm')">{{ t('migrations.undo.confirm') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
