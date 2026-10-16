import type { ApplicationCardDto, PipelineDto, Outcome  } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { decideApplication, moveApplication } from '@/lib/candidate-api'
import { fullName } from '@/lib/candidate-view'
import { createOptimisticBoard } from '@/lib/optimistic-board'
import { decideCard, moveCard } from '@/lib/pipeline-board'

/**
 * The board of a job: the api pipeline plus local optimistic changes. A move or a decision shows at once; if the api
 * refuses it, that change (and only that one) is dropped and a toast says why; overlapping moves of a card are sent
 * in order. Nothing here sends messages to candidates.
 */
export const usePipeline = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const source = usePipelineData(jobId)
  const snapshot = shallowRef<{ pipeline: PipelineDto | null; pending: ReadonlySet<string> }>({ pipeline: null, pending: new Set() })
  const board = createOptimisticBoard(() => {
    snapshot.value = { pipeline: board.view(), pending: board.pending() }
  })
  board.setBase(source.pipeline.value)
  watch(source.pipeline, (fresh) => board.setBase(fresh))

  const apply = async (id: string, change: (current: PipelineDto) => PipelineDto, send: () => Promise<ApplicationCardDto>, failKey: string): Promise<boolean> => {
    const outcome = await board.run(id, change, send)
    if (outcome.status === 'failed') toast.error(t(failKey, { name: fullName(outcome.card.candidate) }), { description: t(errorKeyOf(outcome.error)) })
    return outcome.status === 'done'
  }

  const move = (id: string, stageId: string): Promise<boolean> =>
    apply(id, (current) => moveCard(current, id, stageId, new Date().toISOString()), () => moveApplication(request, id, stageId), 'pipeline.moveFailed')

  const decide = (id: string, outcome: Outcome): Promise<boolean> =>
    apply(id, (current) => decideCard(current, id, outcome, new Date().toISOString()), () => decideApplication(request, id, outcome), 'pipeline.decideFailed')

  /** A change made elsewhere (the candidate sheet) lands on the board without a reload. */
  const accept = (card: ApplicationCardDto): void => board.accept(card)
  const noted = (id: string): void => {
    const card = board.view()?.applications.find((item) => item.id === id)
    if (card) accept({ ...card, noteCount: card.noteCount + 1 })
  }

  return {
    pipeline: computed(() => snapshot.value.pipeline),
    pending: computed(() => snapshot.value.pending),
    errorKey: source.errorKey,
    loading: source.loading,
    refresh: source.refresh,
    move,
    decide,
    accept,
    noted,
  }
}
