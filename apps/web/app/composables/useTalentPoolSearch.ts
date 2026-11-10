import { errorKeyOf } from '@/lib/auth-errors'
import { hasTalentCriteria, talentQuery, type TalentCriteriaForm } from '@/lib/talent-pool-search-view'
import { searchTalentPool, type TalentPage } from '@/lib/talent-pool-api'

export type TalentSearchState = 'idle' | 'running' | 'done' | 'failed'

interface TalentRun {
  readonly state: TalentSearchState
  readonly errorKey: string | null
  readonly result: TalentPage | null
}

const IDLE: TalentRun = { state: 'idle', errorKey: null, result: null }

/**
 * The talent pool search of one job: the candidates of the organization whose consent covers future positions and whose
 * CV meets every criterion. Read only: nothing is added or sent. The last search stays per job while the person moves
 * around Candydati.
 */
export const useTalentPoolSearch = (jobId: string) => {
  const request = useJobsApi()
  const run = useState<TalentRun>(`talent-search-${jobId}`, () => IDLE)
  const patch = (change: Partial<TalentRun>): void => {
    run.value = { ...run.value, ...change }
  }

  const start = async (form: TalentCriteriaForm, page = 1): Promise<void> => {
    if (run.value.state === 'running') return
    const criteria = talentQuery(form)
    if (!hasTalentCriteria(criteria)) return patch({ ...IDLE, state: 'failed', errorKey: 'talentSearch.errors.no_criteria' })
    patch({ state: 'running', errorKey: null })
    try {
      patch({ state: 'done', result: await searchTalentPool(request, { jobId, criteria, page }) })
    } catch (error) {
      patch({ state: 'failed', errorKey: errorKeyOf(error), result: null })
    }
  }

  return { run: computed(() => run.value), start }
}
