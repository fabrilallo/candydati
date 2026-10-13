import type { Outcome } from '@tt/domain'
import type { MaybeRefOrGetter } from 'vue'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { addNote, decideApplication, getCandidate, moveApplication, updateCandidateTags } from '@/lib/candidate-api'
import type { ApplicationCardDto, CandidateDetailDto } from '@/lib/candidate-schemas'
import { loaded } from '@/lib/job-api'

type Busy = 'move' | 'decide' | 'tags' | 'note' | null

/** Applies what the api returned for an application (card shape) to the detail, immutably. */
const withCard = (detail: CandidateDetailDto, card: ApplicationCardDto): CandidateDetailDto => ({
  ...detail,
  applications: detail.applications.map((app) =>
    app.id === card.id
      ? {
          ...app,
          stageId: card.stageId,
          outcome: card.outcome,
          stageChangedAt: card.stageChangedAt,
          closedAt: card.closedAt,
          responseDueAt: card.responseDueAt,
          respondedAt: card.respondedAt,
          responseState: card.responseState,
        }
      : app,
  ),
})

/**
 * One candidate profile (audited by the api on every read) and what can be done on it: move, decide, tags, notes.
 * Each action returns what changed so a board behind the sheet can follow.
 */
export const useCandidate = (candidateId: MaybeRefOrGetter<string>) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, status, refresh } = useFreshAsyncData(() => `candidate-${toValue(candidateId)}`, () => loaded(() => getCandidate(request, toValue(candidateId))))
  const detail = ref<CandidateDetailDto | null>(data.value?.data ?? null)
  watch(data, (fresh) => {
    detail.value = fresh?.data ?? null
  })
  const busy = ref<Busy>(null)

  const run = async <T>(kind: Exclude<Busy, null>, action: () => Promise<T>, successKey: string | null): Promise<T | null> => {
    busy.value = kind
    try {
      const result = await action()
      if (successKey) toast.success(t(successKey))
      return result
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
      return null
    } finally {
      busy.value = null
    }
  }

  const applyCard = (card: ApplicationCardDto | null): ApplicationCardDto | null => {
    if (card && detail.value) detail.value = withCard(detail.value, card)
    return card
  }

  const move = async (applicationId: string, stageId: string) => applyCard(await run('move', () => moveApplication(request, applicationId, stageId), 'candidate.actions.moved'))
  const decide = async (applicationId: string, outcome: Outcome) => applyCard(await run('decide', () => decideApplication(request, applicationId, outcome), 'candidate.actions.decided'))

  const saveTags = async (tags: readonly string[]): Promise<boolean> => {
    const fresh = await run('tags', () => updateCandidateTags(request, toValue(candidateId), tags), null)
    if (fresh) detail.value = fresh
    return fresh !== null
  }

  const note = async (body: string, applicationId: string | null): Promise<boolean> => {
    const created = await run('note', () => addNote(request, toValue(candidateId), body, applicationId), 'candidate.notes.saved')
    if (created && detail.value) detail.value = { ...detail.value, notes: [created, ...detail.value.notes] }
    return created !== null
  }

  /** A message was queued on an application: its count follows, when the api gave one. */
  const messaged = (applicationId: string): void => {
    if (!detail.value) return
    detail.value = {
      ...detail.value,
      applications: detail.value.applications.map((app) => (app.id === applicationId && app.messageCount !== null ? { ...app, messageCount: app.messageCount + 1 } : app)),
    }
  }

  return {
    detail: computed(() => detail.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    busy: computed(() => busy.value),
    refresh,
    /** A fresh detail the api returned elsewhere (correction, consent withdrawal). */
    replace: (fresh: CandidateDetailDto): void => {
      detail.value = fresh
    },
    move,
    decide,
    saveTags,
    note,
    messaged,
  }
}
