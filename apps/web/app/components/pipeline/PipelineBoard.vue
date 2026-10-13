<script setup lang="ts">
import type { Outcome } from '@tt/domain'
import type { ApplicationCardDto, StageRef } from '@/lib/candidate-schemas'
import { fullName } from '@/lib/candidate-view'
import { stageName as nameOfStage, type Board } from '@/lib/pipeline-board'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * The columns of the pipeline. Cards move by drag and drop or from their menu; on a phone one stage shows at a
 * time, picked from a switcher. Who cannot move sees the same board, read-only.
 */
const props = withDefaults(
  defineProps<{ board: Board; stages: readonly StageRef[]; now: Date; canMove: boolean; canDecide: boolean; pending: ReadonlySet<string>; selectable?: boolean; selecting?: boolean; selectedIds?: ReadonlySet<string> }>(),
  { selectable: false, selecting: false, selectedIds: () => new Set<string>() },
)
const emit = defineEmits<{
  open: [card: ApplicationCardDto]
  move: [id: string, stageId: string]
  decide: [card: ApplicationCardDto, outcome: Outcome]
  select: [id: string, shift: boolean]
  selectColumn: [ids: readonly string[]]
}>()
const allSelected = (cards: readonly ApplicationCardDto[]): boolean => cards.length > 0 && cards.every((card) => props.selectedIds.has(card.id))
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const stageName = (stageId: string): string => {
  const stage = props.stages.find((item) => item.id === stageId)
  return stage ? nameOfStage(stage, t) : stageId
}
const dnd = useBoardDrag({
  root,
  stages: () => props.stages,
  canMove: () => props.canMove,
  nameOf: (card) => fullName(card.candidate),
  stageName,
  onMove: (id, stageId) => emit('move', id, stageId),
})
const selected = ref(props.stages[0]?.id ?? '')
const hintId = 'pipeline-card-hint'
</script>

<template>
  <div ref="root" class="grid gap-3">
    <p :id="hintId" class="sr-only">{{ canMove ? t('pipeline.keyboard.hint') : t('pipeline.keyboard.readOnlyHint') }}</p>
    <p class="sr-only" aria-live="assertive" data-testid="board-live">{{ dnd.announcement.value }}</p>
    <label class="grid gap-1.5 md:hidden">
      <span class="text-sm font-medium">{{ t('pipeline.stageSwitcher') }}</span>
      <NativeSelect v-model="selected" data-testid="stage-switcher">
        <option v-for="column in board.columns" :key="column.id" :value="column.id">{{ nameOfStage(column, t) }} ({{ column.cards.length }})</option>
      </NativeSelect>
    </label>
    <div class="-mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" data-testid="pipeline-board">
      <PipelineColumn
        v-for="column in board.columns"
        :key="column.id"
        :column="column"
        :filtered="board.filtered"
        :over="dnd.indicatorStage.value === column.id"
        :indicator="dnd.indicatorStage.value === column.id"
        :class="column.id === selected ? 'flex' : 'max-md:hidden'"
        :selecting="selectable && selecting"
        :all-selected="allSelected(column.cards)"
        @select-all="emit('selectColumn', column.cards.map((card) => card.id))"
        @dragover="dnd.dragOver(column.id, $event)"
        @dragenter="dnd.dragOver(column.id, $event)"
        @dragleave="dnd.dragLeave(column.id, $event)"
        @drop="dnd.drop(column.id, $event)"
      >
        <template #card="{ card }">
          <CandidateCard
            :card="card"
            :stages="stages"
            :now="now"
            :can-move="canMove"
            :can-decide="canDecide"
            :placeholder="dnd.placeholderId.value === card.id"
            :grabbed="dnd.grab.value?.id === card.id"
            :pending="pending.has(card.id)"
            :hint-id="hintId"
            :selectable="selectable"
            :selecting="selecting"
            :selected="props.selectedIds.has(card.id)"
            @select="emit('select', card.id, $event)"
            @open="emit('open', card)"
            @move="emit('move', card.id, $event)"
            @decide="emit('decide', card, $event)"
            @key="dnd.key(card, $event)"
            @dragstart="dnd.dragStart(card, $event)"
            @dragend="dnd.dragEnd"
          />
        </template>
      </PipelineColumn>
    </div>
  </div>
</template>
