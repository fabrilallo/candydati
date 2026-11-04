import type { ShortlistDto } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { ApiFailure } from '@/lib/api-call'
import { listJobShortlists, revokeShortlist, sendShortlist, type ShortlistBody } from '@/lib/client-api'
import { loaded } from '@/lib/job-api'
import { shortlistErrorKey } from '@/lib/shortlist-view'

export type ShortlistSendResult =
  | { readonly ok: true; readonly shortlist: ShortlistDto }
  | { readonly ok: false; readonly errorKey: string; readonly issues: readonly { readonly path: string; readonly message: string }[] }

/** The shortlists sent for a job: list, send, revoke. Newest first, as the api returns them. */
export const useJobShortlists = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, status, refresh } = useFreshAsyncData(`shortlists-${jobId}`, () => loaded(() => listJobShortlists(request, jobId)))
  const revoking = ref<string | null>(null)

  const send = async (body: ShortlistBody): Promise<ShortlistSendResult> => {
    try {
      const shortlist = await sendShortlist(request, jobId, body)
      await refresh()
      return { ok: true, shortlist }
    } catch (error) {
      return { ok: false, errorKey: shortlistErrorKey(error), issues: error instanceof ApiFailure ? error.failure.issues : [] }
    }
  }

  const revoke = async (id: string): Promise<boolean> => {
    revoking.value = id
    try {
      await revokeShortlist(request, id)
      await refresh()
      toast.success(t('shortlists.list.revoked'))
      return true
    } catch (error) {
      toast.error(t(shortlistErrorKey(error)))
      return false
    } finally {
      revoking.value = null
    }
  }

  return {
    shortlists: computed<readonly ShortlistDto[]>(() => data.value?.data ?? []),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    revoking: computed(() => revoking.value),
    refresh,
    send,
    revoke,
  }
}
