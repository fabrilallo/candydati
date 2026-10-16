<script setup lang="ts">
import type { ImportBatchDto } from '@candydati/domain'
import { FileUpIcon, LoaderCircleIcon, Undo2Icon } from '@lucide/vue'
import { formatDateTime } from '@/lib/format'
import { batchFigures, batchTone, isWorking } from '@/lib/import-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The organization's imports: date, author, job, counts, status. A batch still in progress opens at its step; a done
 * batch can be undone after a confirmation that states exactly what is erased.
 */
const { t, locale } = useI18n()
const imports = useImports()
const undoing = ref<ImportBatchDto | null>(null)
const undoOpen = computed({ get: () => undoing.value !== null, set: (open: boolean) => (open ? undefined : (undoing.value = null)) })
const confirmUndo = async (): Promise<void> => {
  const target = undoing.value
  if (!target) return
  if (await imports.undo(target.id)) undoing.value = null
}
const resumable = (batch: ImportBatchDto): boolean => batch.status === 'ready' || isWorking(batch.status)
</script>

<template>
  <section class="grid gap-3" aria-labelledby="imports-list">
    <h2 id="imports-list" class="sr-only">{{ t('imports.list.label') }}</h2>
    <div v-if="imports.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="imports.errorKey.value" />
      <div><Button variant="outline" @click="() => imports.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!imports.items.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-18 w-full" /><Skeleton class="h-18 w-full" /></div>
    <div v-else-if="imports.items.value.length === 0" class="grid justify-items-start gap-3 rounded-xl border border-dashed border-input px-6 py-8" data-testid="imports-empty">
      <div class="grid gap-1">
        <p class="text-[0.9375rem] font-medium">{{ t('imports.list.empty') }}</p>
        <p class="max-w-xl text-sm text-pretty text-muted-foreground">{{ t('imports.list.emptyBody') }}</p>
      </div>
      <Button as-child size="sm"><NuxtLink to="/app/imports/new"><FileUpIcon aria-hidden="true" />{{ t('imports.new') }}</NuxtLink></Button>
    </div>
    <ul v-else class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="import-list">
      <li v-for="batch in imports.items.value" :key="batch.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6" data-testid="import-item" :data-status="batch.status">
        <div class="grid min-w-0 flex-1 gap-1">
          <p class="flex flex-wrap items-center gap-2">
            <NuxtLink :to="`/app/imports/${batch.id}`" class="figure text-[0.9375rem] font-medium underline-offset-4 hover:underline">{{ formatDateTime(batch.createdAt, locale) }}</NuxtLink>
            <Badge :variant="batchTone(batch.status)" data-testid="import-status">
              <LoaderCircleIcon v-if="isWorking(batch.status)" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />{{ t(`imports.status.${batch.status}`) }}
            </Badge>
          </p>
          <p class="flex flex-wrap gap-x-2.5 gap-y-1 text-sm text-muted-foreground [&>*+*]:before:mr-2.5 [&>*+*]:before:text-input [&>*+*]:before:content-['|']">
            <span class="font-medium text-foreground">{{ batch.job?.title ?? t('imports.list.noJob') }}</span>
            <span v-if="batch.createdBy.name">{{ t('imports.list.by', { name: batch.createdBy.name }) }}</span>
            <span class="figure" data-testid="import-counts">
              <template v-if="batch.status === 'done' || batch.status === 'undone'">
                {{ t('imports.list.created', { count: batchFigures(batch.counts).created }, batchFigures(batch.counts).created) }}, {{ t('imports.list.merged', { count: batch.counts.merged }, batch.counts.merged) }}<template v-if="batch.counts.skippedReconfirmed > 0">, {{ t('imports.list.reconfirmed', { count: batch.counts.skippedReconfirmed }, batch.counts.skippedReconfirmed) }}</template>
              </template>
              <template v-else-if="batch.counts.items > 0">{{ t('imports.list.proposed', { count: batch.counts.items }, batch.counts.items) }}</template>
              <template v-else>{{ t('imports.list.files', { count: batch.counts.files }, batch.counts.files) }}</template>
            </span>
          </p>
        </div>
        <Button v-if="resumable(batch)" as-child variant="outline" size="sm"><NuxtLink :to="`/app/imports/${batch.id}`">{{ t('imports.list.resume') }}</NuxtLink></Button>
        <Button v-if="batch.status === 'done'" variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="imports.undoing.value !== null" data-testid="import-undo" @click="undoing = batch">
          <Undo2Icon aria-hidden="true" />{{ t('imports.list.undo') }}
        </Button>
      </li>
    </ul>
    <UndoImportDialog v-model:open="undoOpen" :batch="undoing" :pending="imports.undoing.value !== null" @confirm="confirmUndo" />
  </section>
</template>
