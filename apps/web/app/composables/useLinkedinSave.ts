import type { LinkedinProfile, SourcingOutcome } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { chromeRuntime } from '@/lib/extension-bridge'
import { takePendingProfile } from '@/lib/extension-save'
import { listJobs } from '@/lib/job-api'
import { contactFromProfile } from '@/lib/linkedin-save-view'
import { addContacts } from '@/lib/sourcing-api'

/** Open positions shown in the picker: the first page is plenty for one person to choose from. */
const JOBS_LIMIT = 100

export type LinkedinSaveState = 'loading' | 'ready' | 'empty' | 'extension_missing' | 'failed'

export interface JobChoice {
  readonly id: string
  readonly title: string
}

const openJobs = async (request: ReturnType<typeof useJobsApi>): Promise<readonly JobChoice[]> =>
  (await listJobs(request, 'published', 1, JOBS_LIMIT)).jobs.map((job) => ({ id: job.id, title: job.title }))

/**
 * The save page of the extension's button: takes the one profile the person clicked on LinkedIn (once: the extension
 * forgets it), lists the open positions, and adds the person as a sourced contact of the one picked.
 */
export const useLinkedinSave = () => {
  const request = useJobsApi()
  const config = useRuntimeConfig().public
  const state = ref<LinkedinSaveState>('loading')
  const profile = shallowRef<LinkedinProfile | null>(null)
  const jobs = shallowRef<readonly JobChoice[]>([])
  const busy = ref(false)
  const errorKey = ref<string | null>(null)
  const result = shallowRef<{ readonly outcome: SourcingOutcome; readonly jobId: string } | null>(null)

  const loadJobs = async (): Promise<void> => {
    try {
      jobs.value = await openJobs(request)
    } catch (error) {
      errorKey.value = errorKeyOf(error)
    }
  }

  const load = async (): Promise<void> => {
    const answer = await takePendingProfile(chromeRuntime(), config.extensionId)
    if (!answer.ok) {
      state.value = answer.error
      return
    }
    profile.value = answer.profile
    if (!answer.profile) {
      state.value = 'empty'
      return
    }
    await loadJobs()
    state.value = 'ready'
  }

  const save = async (jobId: string, evidence: string): Promise<void> => {
    if (!profile.value || busy.value) return
    busy.value = true
    errorKey.value = null
    try {
      const [first] = await addContacts(request, jobId, [contactFromProfile(profile.value, evidence)])
      if (first) result.value = { outcome: first.outcome, jobId }
    } catch (error) {
      errorKey.value = errorKeyOf(error)
    } finally {
      busy.value = false
    }
  }

  const read = <T>(source: Ref<T>) => computed(() => source.value)
  return { state: read(state), profile: read(profile), jobs: read(jobs), busy: read(busy), errorKey: read(errorKey), result: read(result), load, save }
}
