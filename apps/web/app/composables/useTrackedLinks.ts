import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { attempt } from '@/lib/load-result'
import { listTrackedLinks, removeTrackedLink, saveTrackedLink, type TrackedLinkDto } from '@/lib/tracked-link-api'

/**
 * The tracked links saved on a job: read when the Distribution tab opens, saved and removed one at a time. The list
 * shows what the api answered; `busy` is the id being removed, or `save` while a link is being saved.
 */
export const useTrackedLinks = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData(`tracked-links-${jobId}`, () => attempt(() => listTrackedLinks(request, jobId)))
  const local = ref<readonly TrackedLinkDto[] | null>(null)
  const links = computed<readonly TrackedLinkDto[]>(() => local.value ?? data.value?.data ?? [])
  // A fresh read (the tab opened again, a refresh) replaces what the last change answered.
  watch(data, () => (local.value = null))
  const busy = ref<string | null>(null)

  const run = async (key: string, work: () => Promise<string>, failedKey: string): Promise<boolean> => {
    busy.value = key
    try {
      toast.success(t(await work()))
      return true
    } catch (error) {
      toast.error(t(failedKey), { description: t(errorKeyOf(error)) })
      return false
    } finally {
      busy.value = null
    }
  }

  const save = (link: { readonly source: string; readonly campaign: string }): Promise<boolean> =>
    run('save', async () => {
      const saved = await saveTrackedLink(request, jobId, link)
      local.value = saved.created ? [...links.value, saved.link] : links.value
      return saved.created ? 'trackedLinks.saved.created' : 'trackedLinks.saved.exists'
    }, 'trackedLinks.saved.saveFailed')

  const remove = (linkId: string): Promise<boolean> =>
    run(linkId, async () => {
      await removeTrackedLink(request, jobId, linkId)
      local.value = links.value.filter((link) => link.id !== linkId)
      return 'trackedLinks.saved.removed'
    }, 'trackedLinks.saved.removeFailed')

  return {
    links,
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    save,
    remove,
    refresh,
  }
}
