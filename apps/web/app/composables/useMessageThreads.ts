import type { MessageDto } from '@tt/domain'
import { attempt } from '@/lib/load-result'
import { listMessages } from '@/lib/message-api'
import { threadOf } from '@/lib/message-view'

export type ThreadState = { readonly status: 'loading' } | { readonly status: 'ready'; readonly messages: readonly MessageDto[] } | { readonly status: 'error'; readonly errorKey: string }

/**
 * The conversations of a candidate, one per application, loaded when the Messaggi tab opens (reading them is
 * `message:read`). Each thread loads and fails on its own, so one broken conversation never hides the others.
 */
export const useMessageThreads = (applicationIds: () => readonly string[]) => {
  const request = useJobsApi()
  const threads = ref<Readonly<Record<string, ThreadState>>>({})

  const load = async (applicationId: string): Promise<void> => {
    threads.value = { ...threads.value, [applicationId]: { status: 'loading' } }
    const result = await attempt(() => listMessages(request, applicationId))
    const next: ThreadState = result.errorKey === null ? { status: 'ready', messages: threadOf(result.data) } : { status: 'error', errorKey: result.errorKey }
    threads.value = { ...threads.value, [applicationId]: next }
  }

  const loadAll = async (): Promise<void> => {
    await Promise.all(applicationIds().map(load))
  }

  return { threads: computed(() => threads.value), load, loadAll }
}
