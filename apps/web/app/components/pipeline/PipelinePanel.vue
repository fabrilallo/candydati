<script setup lang="ts">
import type { ApplicationCardDto, EmailTemplateKind, Outcome  } from '@tt/domain'
import { ListChecksIcon, SearchIcon } from '@lucide/vue'
import { fullName } from '@/lib/candidate-view'
import { outcomeTemplateKind } from '@/lib/message-view'
import { can } from '@/lib/permissions-ui'
import { boardOf } from '@/lib/pipeline-board'
import { clickSelection, EMPTY_SELECTION, keepOnly, orderedIds, toggleGroup, type Selection } from '@/lib/selection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Board, search, outcomes and the candidate sheet of one job. Permissions decide what can be moved or decided. */
const props = defineProps<{ jobId: string }>()
const { t } = useI18n()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const canMove = computed(() => can(role.value, 'candidate:move'))
const canDecide = computed(() => can(role.value, 'candidate:decide'))
const canSend = computed(() => can(role.value, 'message:send'))
const pl = usePipeline(props.jobId)
const query = ref('')
const board = computed(() => (pl.pipeline.value ? boardOf(pl.pipeline.value, query.value) : null))
const stages = computed(() => pl.pipeline.value?.stages.map(({ id, declared }) => ({ id, declared })) ?? [])
const nowMs = useState('pipeline-now', () => Date.now())
const now = computed(() => new Date(nowMs.value))
const empty = computed(() => (pl.pipeline.value?.applications.length ?? 0) === 0)

const composing = ref<{ readonly cards: readonly ApplicationCardDto[]; readonly kind: EmailTemplateKind | null; readonly fromSelection: boolean } | null>(null)
const deciding = ref<{ readonly card: ApplicationCardDto; readonly outcome: Outcome } | null>(null)
const decideOpen = computed({
  get: () => deciding.value !== null,
  set: (open: boolean) => {
    if (!open) deciding.value = null
  },
})
const confirmDecide = async (): Promise<void> => {
  const chosen = deciding.value
  deciding.value = null
  if (!chosen || !(await pl.decide(chosen.card.id, chosen.outcome))) return
  const kind = outcomeTemplateKind(chosen.outcome)
  const fresh = pl.pipeline.value?.applications.find((card) => card.id === chosen.card.id)
  if (kind && fresh && canSend.value) composing.value = { cards: [fresh], kind, fromSelection: false }
}

// Selection for bulk messages: ranges follow what is on screen, a search does not drop what was picked.
const selecting = ref(false)
const selection = ref<Selection>(EMPTY_SELECTION)
const visibleOrder = computed(() => (board.value ? [...board.value.columns.flatMap((column) => column.cards), ...board.value.outcomes.flatMap((group) => group.cards)].map((card) => card.id) : []))
const allIds = computed(() => pl.pipeline.value?.applications.map((card) => card.id) ?? [])
watch(allIds, (ids) => {
  selection.value = keepOnly(selection.value, ids)
})
const select = (id: string, shift: boolean): void => {
  selecting.value = true
  selection.value = clickSelection(selection.value, visibleOrder.value, id, shift)
}
const selectColumn = (ids: readonly string[]): void => {
  selection.value = toggleGroup(selection.value, ids)
}
const clearSelection = (): void => {
  selection.value = EMPTY_SELECTION
  selecting.value = false
}
const toggleSelecting = (): void => {
  if (selecting.value) clearSelection()
  else selecting.value = true
}
const selectedCards = computed(() => {
  const cards = pl.pipeline.value?.applications ?? []
  return orderedIds(selection.value, allIds.value).flatMap((id) => cards.filter((card) => card.id === id))
})
const messageSelected = (): void => {
  composing.value = { cards: selectedCards.value, kind: null, fromSelection: true }
}
const sent = (): void => {
  if (composing.value?.fromSelection) clearSelection()
  composing.value = null
}
const opened = ref<{ readonly candidateId: string; readonly applicationId: string } | null>(null)
/** The candidate (or the opened application) was erased from the sheet: close it and read the board again. */
const erasedFromSheet = async (candidateGone: boolean): Promise<void> => {
  if (candidateGone) opened.value = null
  await pl.refresh()
}
const openCard = (card: ApplicationCardDto): void => {
  opened.value = { candidateId: card.candidate.id, applicationId: card.id }
}
</script>

<template>
  <div class="grid gap-5">
    <NotAccessible v-if="pl.errorKey.value === 'errors.notFound'" back-to="/app/jobs" back-key="notAccessible.backJobs" />
    <div v-else-if="pl.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="pl.errorKey.value" />
      <div><Button variant="outline" @click="() => pl.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <PipelineSkeleton v-else-if="!board" />
    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground" aria-live="polite" data-testid="pipeline-summary">
          {{ t('pipeline.summary', { open: board.openTotal, decided: board.decidedTotal }) }}
        </p>
        <div class="flex w-full items-center gap-2 sm:w-auto">
        <Button v-if="canSend && !empty" variant="outline" :aria-pressed="selecting" data-testid="selection-toggle" @click="toggleSelecting">
          <ListChecksIcon aria-hidden="true" />{{ selecting ? t('pipeline.selection.done') : t('pipeline.selection.start') }}
        </Button>
        <div class="relative w-full sm:w-72">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input v-model="query" type="search" class="pl-9" :placeholder="t('pipeline.search')" :aria-label="t('pipeline.search')" data-testid="pipeline-search" />
        </div>
        </div>
      </div>
      <p v-if="empty" class="rounded-xl border border-dashed border-input px-5 py-4 text-sm text-muted-foreground" data-testid="pipeline-empty">
        {{ pl.pipeline.value?.job.status === 'published' ? t('pipeline.emptyPublished') : t('pipeline.emptyNotPublished') }}
      </p>
      <PipelineBoard
        :board="board"
        :stages="stages"
        :now="now"
        :can-move="canMove"
        :can-decide="canDecide"
        :pending="pl.pending.value"
        :selectable="canSend"
        :selecting="selecting"
        :selected-ids="selection.ids"
        @select="select"
        @select-column="selectColumn"
        @open="openCard"
        @move="pl.move"
        @decide="(card, outcome) => (deciding = { card, outcome })"
      />
      <OutcomesArea
        :groups="board.outcomes"
        :total="board.decidedTotal"
        :stages="stages"
        :now="now"
        :selectable="canSend"
        :selecting="selecting"
        :selected-ids="selection.ids"
        @open="openCard"
        @select="select"
      />
      <SelectionBar v-if="selection.ids.size > 0" :count="selection.ids.size" @message="messageSelected" @clear="clearSelection" />
    </template>
    <ConfirmDialog
      v-model:open="decideOpen"
      :title="t('candidate.decide.title')"
      :body="deciding ? t('candidate.decide.body', { name: fullName(deciding.card.candidate), outcome: t(`candidate.outcomes.${deciding.outcome}`) }) : ''"
      :confirm-label="t('candidate.decide.confirm')"
      @confirm="confirmDecide"
    />
    <BulkComposerSheet :cards="composing?.cards ?? []" :kind="composing?.kind ?? null" @close="composing = null" @sent="sent" />
    <CandidateSheet :candidate-id="opened?.candidateId ?? null" :application-id="opened?.applicationId ?? null" :via-job-id="jobId" @close="opened = null" @card="pl.accept" @noted="(id) => id && pl.noted(id)" @erased="erasedFromSheet" />
  </div>
</template>
