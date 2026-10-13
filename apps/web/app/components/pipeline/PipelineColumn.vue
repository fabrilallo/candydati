<script setup lang="ts">
import type { BoardColumn } from '@/lib/pipeline-board'
import { stageName, stageTone } from '@/lib/pipeline-board'
import { formatDuration } from '@/lib/job-view'

/** One stage of the board: dot, name, count, who runs it, the cards, and the drop line while something hovers. */
const props = defineProps<{ column: BoardColumn; filtered: boolean; over: boolean; indicator: boolean }>()
const { t } = useI18n()
const tr = useVisitorTranslate()
const titleId = computed(() => `stage-${props.column.id}`)
const detail = computed(() => {
  const declared = props.column.declared
  return declared ? `${t(`taxonomy.stageConductors.${declared.conductedBy}`)} · ${formatDuration(declared.durationMinutes, tr)}` : t('pipeline.receivedHint')
})
</script>

<template>
  <section
    :aria-labelledby="titleId"
    class="flex min-h-48 w-full shrink-0 flex-col gap-2 rounded-xl bg-muted/60 p-2 transition-colors duration-150 ease-snap md:w-80"
    :class="over ? 'bg-accent/60 ring-2 ring-primary/30' : ''"
    data-testid="pipeline-column"
    :data-stage-id="column.id"
  >
    <header class="grid gap-0.5 px-2 pt-1.5 pb-1">
      <div class="flex items-center gap-2">
        <StageDot :tone="stageTone(column)" />
        <h2 :id="titleId" class="min-w-0 truncate text-sm font-semibold">{{ stageName(column, t) }}</h2>
        <span class="figure rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border" data-testid="column-count">
          <span class="sr-only">{{ t('pipeline.columnCount', { count: column.cards.length }, column.cards.length) }}</span>
          <span aria-hidden="true">{{ column.cards.length }}</span>
        </span>
      </div>
      <p class="truncate pl-4 text-xs text-muted-foreground">{{ detail }}</p>
    </header>
    <div v-if="indicator" class="mx-1 h-0.5 rounded-full bg-primary" data-testid="drop-indicator" aria-hidden="true" />
    <ol v-if="column.cards.length > 0" class="grid gap-2">
      <li v-for="card in column.cards" :key="card.id"><slot name="card" :card="card" /></li>
    </ol>
    <p v-else-if="!indicator" class="rounded-lg border border-dashed border-input px-3 py-6 text-center text-sm text-muted-foreground" data-testid="column-empty">
      {{ filtered ? t('pipeline.emptyFiltered') : t('pipeline.emptyColumn') }}
    </p>
  </section>
</template>
