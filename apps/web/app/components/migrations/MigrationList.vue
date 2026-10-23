<script setup lang="ts">
import type { MigrationBatchDto } from '@candydati/domain'
import { ArrowRightLeftIcon, LoaderCircleIcon, Undo2Icon } from '@lucide/vue'
import { formatDateTime } from '@/lib/format'
import { isWorking, migrationTone } from '@/lib/migration-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The organization's migrations: date, source, status, what the package holds. One still in progress or waiting for a
 * review opens at its step; a finished one can be undone after a confirmation that states exactly what is erased.
 */
const { t, locale } = useI18n()
const migrations = useMigrations()
const undoing = ref<MigrationBatchDto | null>(null)
const undoOpen = computed({ get: () => undoing.value !== null, set: (open: boolean) => (open ? undefined : (undoing.value = null)) })
const confirmUndo = async (): Promise<void> => {
  const target = undoing.value
  if (!target) return
  if (await migrations.undo(target.id)) undoing.value = null
}
const resumable = (batch: MigrationBatchDto): boolean => batch.status === 'ready' || isWorking(batch.status)
</script>

<template>
  <section class="grid gap-3" aria-labelledby="migrations-list">
    <h2 id="migrations-list" class="sr-only">{{ t('migrations.list.label') }}</h2>
    <div v-if="migrations.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="migrations.errorKey.value" />
      <div><Button variant="outline" @click="() => migrations.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!migrations.items.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-18 w-full" /><Skeleton class="h-18 w-full" /></div>
    <div v-else-if="migrations.items.value.length === 0" class="grid justify-items-start gap-3 rounded-xl border border-dashed border-input px-6 py-8" data-testid="migrations-empty">
      <div class="grid gap-1">
        <p class="text-[0.9375rem] font-medium">{{ t('migrations.list.empty') }}</p>
        <p class="max-w-xl text-sm text-pretty text-muted-foreground">{{ t('migrations.list.emptyBody') }}</p>
      </div>
      <Button as-child size="sm"><NuxtLink to="/app/migrations/new"><ArrowRightLeftIcon aria-hidden="true" />{{ t('migrations.new') }}</NuxtLink></Button>
    </div>
    <ul v-else class="divide-y overflow-hidden rounded-xl panel shadow-xs" data-testid="migration-list">
      <li v-for="batch in migrations.items.value" :key="batch.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6" data-testid="migration-item" :data-status="batch.status">
        <div class="grid min-w-0 flex-1 gap-1">
          <p class="flex flex-wrap items-center gap-2">
            <NuxtLink :to="`/app/migrations/${batch.id}`" class="figure text-[0.9375rem] font-medium underline-offset-4 hover:underline">{{ formatDateTime(batch.createdAt, locale) }}</NuxtLink>
            <Badge :variant="migrationTone(batch.status)" data-testid="migration-status">
              <LoaderCircleIcon v-if="isWorking(batch.status)" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />{{ t(`migrations.status.${batch.status}`) }}
            </Badge>
          </p>
          <p class="flex flex-wrap gap-x-2.5 gap-y-1 text-sm text-muted-foreground [&>*+*]:before:mr-2.5 [&>*+*]:before:text-input [&>*+*]:before:content-['|']">
            <span class="font-medium text-foreground">{{ batch.sourceSystem ? t('migrations.list.source', { source: batch.sourceSystem }) : t('migrations.list.unknownSource') }}</span>
            <template v-if="batch.counts.jobs !== undefined">
              <span class="figure">{{ t('migrations.list.jobs', { count: batch.counts.jobs }, batch.counts.jobs) }}</span>
              <span class="figure">{{ t('migrations.list.candidates', { count: batch.counts.candidates ?? 0 }, batch.counts.candidates ?? 0) }}</span>
              <span class="figure">{{ t('migrations.list.applications', { count: batch.counts.applications ?? 0 }, batch.counts.applications ?? 0) }}</span>
            </template>
          </p>
        </div>
        <Button v-if="resumable(batch)" as-child variant="outline" size="sm"><NuxtLink :to="`/app/migrations/${batch.id}`">{{ t('migrations.list.resume') }}</NuxtLink></Button>
        <Button v-else as-child variant="ghost" size="sm"><NuxtLink :to="`/app/migrations/${batch.id}`">{{ t('migrations.list.open') }}</NuxtLink></Button>
        <Button v-if="batch.status === 'done'" variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="migrations.undoing.value !== null" data-testid="migration-list-undo" @click="undoing = batch">
          <Undo2Icon aria-hidden="true" />{{ t('migrations.list.undo') }}
        </Button>
      </li>
    </ul>
    <UndoMigrationDialog v-model:open="undoOpen" :batch="undoing" :pending="migrations.undoing.value !== null" @confirm="confirmUndo" />
  </section>
</template>
