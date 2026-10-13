import type { CandidateCorrection, ConsentScope } from '@tt/domain'
import type { MaybeRefOrGetter } from 'vue'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import type { CandidateDetailDto } from '@/lib/candidate-schemas'
import { correctCandidate, eraseApplication, eraseCandidate, isEmailConflict, withdrawConsent, type WithdrawResult } from '@/lib/gdpr-api'

type Busy = 'correct' | 'withdraw' | 'erase' | null

export type CorrectOutcome = { readonly detail: CandidateDetailDto } | { readonly emailTaken: true } | { readonly errorKey: string }

/** What erasure removes: the whole candidate, or one application (the last one takes the candidate with it). */
export type EraseTarget = { readonly kind: 'candidate' } | { readonly kind: 'application'; readonly applicationId: string; readonly jobTitle: string; readonly last: boolean }

/**
 * The four rights of the candidate (PLAN §7) as the recruiter carries them out: correct, withdraw a consent, erase.
 * The export is a plain download link. Every call is audited by the api.
 */
export const useCandidateRights = (candidateId: MaybeRefOrGetter<string>) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const busy = ref<Busy>(null)

  const correct = async (input: CandidateCorrection): Promise<CorrectOutcome> => {
    busy.value = 'correct'
    try {
      const detail = await correctCandidate(request, toValue(candidateId), input)
      toast.success(t('gdpr.correct.saved'))
      return { detail }
    } catch (error) {
      return isEmailConflict(error) ? { emailTaken: true } : { errorKey: errorKeyOf(error) }
    } finally {
      busy.value = null
    }
  }

  const withdraw = async (applicationId: string, scope: ConsentScope): Promise<WithdrawResult | null> => {
    busy.value = 'withdraw'
    try {
      const result = await withdrawConsent(request, applicationId, scope)
      toast.success(t(result.erased ? 'gdpr.withdraw.doneErased' : 'gdpr.withdraw.done'))
      return result
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
      return null
    } finally {
      busy.value = null
    }
  }

  /** `name` is the candidate's full name, already matched against what the person typed. */
  const erase = async (target: EraseTarget, name: string): Promise<string | null> => {
    busy.value = 'erase'
    try {
      if (target.kind === 'candidate') await eraseCandidate(request, toValue(candidateId), name)
      else await eraseApplication(request, target.applicationId, name)
      toast.success(target.kind === 'candidate' || target.last ? t('gdpr.erase.doneCandidate', { name }) : t('gdpr.erase.doneApplication'))
      return null
    } catch (error) {
      return errorKeyOf(error)
    } finally {
      busy.value = null
    }
  }

  return { busy: computed(() => busy.value), correct, withdraw, erase }
}
