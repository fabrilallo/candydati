<script setup lang="ts">
import { SearchIcon } from '@lucide/vue'
import type { Outcome } from '@tt/domain'
import type { ApplicationCardDto } from '@/lib/candidate-schemas'
import { fullName } from '@/lib/candidate-view'
import { can } from '@/lib/permissions-ui'
import { boardOf } from '@/lib/pipeline-board'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Board, search, outcomes and the candidate sheet of one job. Permissions decide what can be moved or decided. */
const props = defineProps<{ jobId: string }>()
const { t } = useI18n()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const canMove = computed(() => can(role.value, 'candidate:move'))
const canDecide = computed(() => can(role.value, 'candidate:decide'))
const pl = usePipeline(props.jobId)
const query = ref('')
const board = computed(() => (pl.pipeline.value ? boardOf(pl.pipeline.value, query.value) : null))
const stages = computed(() => pl.pipeline.value?.stages.map(({ id, declared }) => ({ id, declared })) ?? [])
const nowMs = useState('pipeline-now', () => Date.now())
const now = computed(() => new Date(nowMs.value))
const empty = computed(() => (pl.pipeline.value?.applications.length ?? 0) === 0)

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
  if (chosen) await pl.decide(chosen.card.id, chosen.outcome)
}
const opened = ref<{ readonly candidateId: string; readonly applicationId: string } | null>(null)
const openCard = (card: ApplicationCardDto): void => {
  opened.value = { candidateId: card.candidate.id, applicationId: card.id }
}
</script>

<template>
  <div class="grid gap-5">
    <div v-if="pl.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="pl.errorKey.value" />
      <div><Button variant="outline" @click="() => pl.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <PipelineSkeleton v-else-if="!board" />
    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground" aria-live="polite" data-testid="pipeline-summary">
          {{ t('pipeline.summary', { open: board.openTotal, decided: board.decidedTotal }) }}
        </p>
        <div class="relative w-full sm:w-72">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input v-model="query" type="search" class="pl-9" :placeholder="t('pipeline.search')" :aria-label="t('pipeline.search')" data-testid="pipeline-search" />
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
        @open="openCard"
        @move="pl.move"
        @decide="(card, outcome) => (deciding = { card, outcome })"
      />
      <OutcomesArea :groups="board.outcomes" :total="board.decidedTotal" :stages="stages" :now="now" @open="openCard" />
    </template>
    <ConfirmDialog
      v-model:open="decideOpen"
      :title="t('candidate.decide.title')"
      :body="deciding ? t('candidate.decide.body', { name: fullName(deciding.card.candidate), outcome: t(`candidate.outcomes.${deciding.outcome}`) }) : ''"
      :confirm-label="t('candidate.decide.confirm')"
      @confirm="confirmDecide"
    />
    <CandidateSheet :candidate-id="opened?.candidateId ?? null" :application-id="opened?.applicationId ?? null" @close="opened = null" @card="pl.accept" @noted="(id) => id && pl.noted(id)" />
  </div>
</template>
