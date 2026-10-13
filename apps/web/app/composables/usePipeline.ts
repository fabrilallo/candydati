import type { Outcome } from '@tt/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { decideApplication, moveApplication } from '@/lib/candidate-api'
import type { ApplicationCardDto, PipelineDto } from '@/lib/candidate-schemas'
import { fullName } from '@/lib/candidate-view'
import { decideCard, moveCard, replaceCard } from '@/lib/pipeline-board'

/**
 * The board of a job: the api pipeline plus local optimistic changes. A move or a decision shows at once; if the api
 * refuses it, the card goes back where it was and a toast says why. Nothing here sends messages to candidates.
 */
export const usePipeline = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const source = usePipelineData(jobId)
  const pipeline = ref<PipelineDto | null>(source.pipeline.value)
  watch(source.pipeline, (fresh) => {
    pipeline.value = fresh
  })
  const pending = ref<ReadonlySet<string>>(new Set())

  const setPending = (id: string, on: boolean): void => {
    pending.value = on ? new Set([...pending.value, id]) : new Set([...pending.value].filter((item) => item !== id))
  }

  const apply = async (id: string, change: (current: PipelineDto) => PipelineDto, send: () => Promise<ApplicationCardDto>, failKey: string): Promise<boolean> => {
    const current = pipeline.value
    const before = current?.applications.find((card) => card.id === id)
    if (!current || !before) return false
    const next = change(current)
    if (next === current) return false
    pipeline.value = next
    setPending(id, true)
    try {
      const fresh = await send()
      if (pipeline.value) pipeline.value = replaceCard(pipeline.value, fresh)
      return true
    } catch (error) {
      if (pipeline.value) pipeline.value = replaceCard(pipeline.value, before)
      toast.error(t(failKey, { name: fullName(before.candidate) }), { description: t(errorKeyOf(error)) })
      return false
    } finally {
      setPending(id, false)
    }
  }

  const move = (id: string, stageId: string): Promise<boolean> =>
    apply(id, (current) => moveCard(current, id, stageId, new Date().toISOString()), () => moveApplication(request, id, stageId), 'pipeline.moveFailed')

  const decide = (id: string, outcome: Outcome): Promise<boolean> =>
    apply(id, (current) => decideCard(current, id, outcome, new Date().toISOString()), () => decideApplication(request, id, outcome), 'pipeline.decideFailed')

  /** A change made elsewhere (the candidate sheet) lands on the board without a reload. */
  const accept = (card: ApplicationCardDto): void => {
    if (pipeline.value) pipeline.value = replaceCard(pipeline.value, card)
  }
  const noted = (id: string): void => {
    const card = pipeline.value?.applications.find((item) => item.id === id)
    if (card) accept({ ...card, noteCount: card.noteCount + 1 })
  }

  return { pipeline: computed(() => pipeline.value), pending: computed(() => pending.value), errorKey: source.errorKey, loading: source.loading, refresh: source.refresh, move, decide, accept, noted }
}
