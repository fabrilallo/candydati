import { toast } from 'vue-sonner'
import type { AddSourcedResultDto, SourcedContactDto, SourcedContactInput } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { addContacts, deleteContact, listContacts, markContacted, noticeText } from '@/lib/sourcing-api'
import { addOutcomeToast } from '@/lib/sourcing-view'

/** One toast per person given: added, or why they were skipped (already there, objected). */
const announce = (t: (key: string) => string, results: readonly AddSourcedResultDto[]): void => {
  for (const result of results) {
    const words = addOutcomeToast(result)
    if (words.kind === 'success') toast.success(t(words.key))
    else toast.info(t(words.key))
  }
}

/** The contacts sourced for one job: list, add by hand, notice text for a first message, mark contacted, erase. */
export const useSourcedContacts = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData(`sourced-contacts-${jobId}`, () => loaded(() => listContacts(request, jobId)))
  const contacts = useSyncedData<readonly SourcedContactDto[]>(data)
  const busy = ref<string | null>(null)
  const saveErrorKey = ref<string | null>(null)
  const run = useBusyRunner(busy)

  const replace = (fresh: SourcedContactDto): void => {
    contacts.value = (contacts.value ?? []).map((item) => (item.id === fresh.id ? fresh : item))
  }

  const add = async (input: SourcedContactInput): Promise<boolean> => {
    busy.value = 'new'
    saveErrorKey.value = null
    try {
      announce(t, await addContacts(request, jobId, [input]))
      await refresh()
      return true
    } catch (error) {
      saveErrorKey.value = errorKeyOf(error)
      return false
    } finally {
      busy.value = null
    }
  }

  const notice = (item: SourcedContactDto) => run(item.id, () => noticeText(request, item.id), null)

  const contacted = async (item: SourcedContactDto): Promise<void> => {
    const fresh = await run(item.id, () => markContacted(request, item.id), 'sourcing.markedContacted')
    if (fresh) replace(fresh)
  }

  const remove = async (item: SourcedContactDto, doNotContact: boolean): Promise<boolean> => {
    const done = await run(item.id, () => deleteContact(request, item.id, doNotContact).then(() => true), 'sourcing.deleted')
    if (done) contacts.value = (contacts.value ?? []).filter((contact) => contact.id !== item.id)
    return done === true
  }

  return {
    contacts: computed(() => contacts.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    saveErrorKey: computed(() => saveErrorKey.value),
    clearError: () => {
      saveErrorKey.value = null
    },
    refresh,
    add,
    notice,
    contacted,
    remove,
  }
}
