import { errorKeyOf } from '@/lib/auth-errors'
import { chromeRuntime, searchLinkedinWithExtension, searchWebWithExtension, type ExtensionError } from '@/lib/extension-bridge'
import { acceptLinkedinRisk, getLinkedinStatus, sealLinkedinResults, sealWebResults } from '@/lib/sourcing-api'

export interface LinkedinToolInput {
  readonly jobId: string
  readonly keywords: readonly string[]
  readonly location: string | null
  readonly limit: number
}

export interface WebToolInput {
  readonly jobId: string
  readonly query: string
  readonly limit: number
}

/** What the model reads when the search did not run: a code it explains, never a stack trace. */
export type LinkedinToolOutput = Readonly<Record<string, unknown>>

const failure = (error: ExtensionError | 'linkedin_off' | 'not_accepted', installUrl: string | null = null): LinkedinToolOutput => ({ error: { code: error, ...(installUrl ? { installUrl } : {}) } })

/**
 * The browser side of `search_linkedin_people`: checks that the organization allows it and that this person accepted the
 * risk (asking them, once, through the dialog), asks the extension to read LinkedIn in their own browser, and has the api
 * seal what it read. Resolves with what the model may see. `runWeb` is the browser side of `search_web_people`: Google
 * through the same extension, public results only, so no organization setting nor risk acceptance.
 */
export const useLinkedinBridge = () => {
  const request = useJobsApi()
  const config = useRuntimeConfig().public
  const pendingConsent = shallowRef<((accepted: boolean) => void) | null>(null)
  const askConsent = (): Promise<boolean> => new Promise((resolve) => {
    pendingConsent.value = (accepted) => {
      pendingConsent.value = null
      resolve(accepted)
    }
  })

  const run = async (input: LinkedinToolInput): Promise<LinkedinToolOutput> => {
    try {
      const status = await getLinkedinStatus(request)
      if (!status.enabled) return failure('linkedin_off')
      if (!config.extensionId) return failure('extension_missing', config.extensionUrl || null)
      if (!status.accepted) {
        if (!(await askConsent())) return failure('not_accepted')
        await acceptLinkedinRisk(request, status.textVersion)
      }
      const limit = Math.min(input.limit, status.maxProfilesPerRun)
      const answer = await searchLinkedinWithExtension(chromeRuntime(), config.extensionId, { type: 'candydati.search_linkedin', keywords: input.keywords, location: input.location, limit })
      if (!answer.ok) return failure(answer.error, answer.error === 'extension_missing' ? config.extensionUrl || null : null)
      return (await sealLinkedinResults(request, { jobId: input.jobId, keywords: input.keywords, location: input.location, profiles: answer.profiles })) as LinkedinToolOutput
    } catch (error) {
      return { error: { code: errorKeyOf(error) } }
    }
  }

  const runWeb = async (input: WebToolInput): Promise<LinkedinToolOutput> => {
    try {
      if (!config.extensionId) return failure('extension_missing', config.extensionUrl || null)
      const answer = await searchWebWithExtension(chromeRuntime(), config.extensionId, { type: 'candydati.search_web', query: input.query, limit: input.limit })
      if (!answer.ok) return failure(answer.error, answer.error === 'extension_missing' ? config.extensionUrl || null : null)
      return (await sealWebResults(request, { jobId: input.jobId, query: input.query, results: answer.results })) as LinkedinToolOutput
    } catch (error) {
      return { error: { code: errorKeyOf(error) } }
    }
  }

  return { run, runWeb, pendingConsent: computed(() => pendingConsent.value), answerConsent: (accepted: boolean) => pendingConsent.value?.(accepted) }
}

export type LinkedinBridge = ReturnType<typeof useLinkedinBridge>
