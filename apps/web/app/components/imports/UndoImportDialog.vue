<script setup lang="ts">
import { CheckIcon, Trash2Icon } from '@lucide/vue'
import { formatDateTime } from '@/lib/format'
import { batchFigures } from '@/lib/import-view'
import type { ImportBatchDto } from '@/lib/phase8-contract'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Undo of an import: exactly what goes (people created, and for merged people only what the batch added) and who
 * stays (people who already reconfirmed: their data is theirs). Esc and the overlay stay available until the call starts.
 */
const props = defineProps<{ open: boolean; batch: ImportBatchDto | null; pending: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [] }>()
const { t, locale } = useI18n()
const counts = computed(() => (props.batch ? batchFigures(props.batch.counts) : null))
const guard = (event: Event): void => {
  if (props.pending) event.preventDefault()
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => (pending ? undefined : emit('update:open', value))">
    <DialogContent class="sm:max-w-lg" data-testid="undo-dialog" @interact-outside="guard" @escape-key-down="guard">
      <DialogHeader>
        <DialogTitle>{{ t('imports.undo.title', { date: batch ? formatDateTime(batch.createdAt, locale) : '' }) }}</DialogTitle>
        <DialogDescription>{{ t('imports.undo.irreversible') }}</DialogDescription>
      </DialogHeader>
      <div v-if="counts" class="grid gap-4 rounded-lg border px-4 py-4">
        <section class="grid gap-2" aria-labelledby="undo-deleted">
          <h3 id="undo-deleted" class="text-sm font-semibold">{{ t('imports.undo.intro') }}</h3>
          <ul class="grid gap-1.5 text-sm" data-testid="undo-deleted">
            <li class="figure flex items-start gap-2"><Trash2Icon class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />{{ t('imports.undo.created', { count: counts.created }, counts.created) }}</li>
            <li class="figure flex items-start gap-2"><Trash2Icon class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />{{ t('imports.undo.merged', { count: counts.merged }, counts.merged) }}</li>
          </ul>
        </section>
        <p class="figure flex items-start gap-2 border-t pt-4 text-sm" data-testid="undo-kept"><CheckIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ t('imports.undo.kept') }}</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('imports.undo.cancel') }}</Button>
        <Button type="button" variant="destructive" :disabled="pending" data-testid="undo-confirm" @click="emit('confirm')">{{ t('imports.undo.confirm') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
