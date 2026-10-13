<script setup lang="ts">
import { ChevronDownIcon } from '@lucide/vue'
import type { ApplicationCardDto, StageRef } from '@/lib/candidate-schemas'
import type { OutcomeGroup } from '@/lib/pipeline-board'

/** Decided applications, out of the columns: collapsed by default, grouped by outcome, read-only. */
const props = withDefaults(defineProps<{ groups: readonly OutcomeGroup[]; total: number; stages: readonly StageRef[]; now: Date; selectable?: boolean; selecting?: boolean; selectedIds?: ReadonlySet<string> }>(), {
  selectable: false,
  selecting: false,
  selectedIds: () => new Set<string>(),
})
const emit = defineEmits<{ open: [card: ApplicationCardDto]; select: [id: string, shift: boolean] }>()
const { t } = useI18n()
const open = ref(false)
</script>

<template>
  <section class="grid gap-3 rounded-xl border bg-card px-4 py-3 sm:px-5" aria-labelledby="outcomes-title" data-testid="outcomes">
    <h2 id="outcomes-title" class="text-[0.9375rem] font-semibold">
      <button type="button" class="flex w-full items-center gap-2 py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/35 rounded-md" :aria-expanded="open" aria-controls="outcomes-body" data-testid="outcomes-toggle" @click="open = !open">
        <ChevronDownIcon class="size-4 text-muted-foreground transition-transform duration-150 ease-snap" :class="open ? '' : '-rotate-90'" aria-hidden="true" />
        {{ t('pipeline.outcomes.title') }}
        <span class="figure rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{{ total }}</span>
        <span class="ml-auto hidden text-xs font-normal text-muted-foreground sm:inline">{{ t('pipeline.outcomes.hint') }}</span>
      </button>
    </h2>
    <div v-show="open" id="outcomes-body" class="grid gap-5 pb-2">
      <p v-if="total === 0" class="text-sm text-muted-foreground">{{ t('pipeline.outcomes.empty') }}</p>
      <template v-for="group in groups" :key="group.outcome">
        <div v-if="group.cards.length > 0" class="grid gap-2" :data-outcome="group.outcome">
          <h3 class="text-sm font-medium">{{ t(`candidate.outcomes.${group.outcome}`) }} <span class="figure text-muted-foreground">{{ group.cards.length }}</span></h3>
          <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="card in group.cards" :key="card.id">
              <CandidateCard
                :card="card"
                :stages="stages"
                :now="now"
                :can-move="false"
                :can-decide="false"
                :selectable="selectable"
                :selecting="selecting"
                :selected="props.selectedIds.has(card.id)"
                @open="emit('open', card)"
                @select="emit('select', card.id, $event)"
              />
            </li>
          </ul>
        </div>
      </template>
    </div>
  </section>
</template>
