import type { ClientDto, ClientInput } from '@candydati/domain'
import type { Ref } from 'vue'
import { createClient, listClients, setClientArchived, updateClient } from '@/lib/client-api'
import { clientErrorKey } from '@/lib/client-view'
import { loaded } from '@/lib/job-api'
import { ApiFailure } from '@/lib/api-call'

export type ClientSaveResult =
  | { readonly ok: true; readonly client: ClientDto }
  | { readonly ok: false; readonly errorKey: string; readonly issues: readonly { readonly path: string; readonly message: string }[] }

/**
 * The clients of the organization, archived included (pickers keep the active ones), shared by key. Loads only while
 * `enabled` (the agency setting is on): otherwise there is nothing to ask for.
 */
export const useClients = (enabled: Ref<boolean>) => {
  const request = useJobsApi()
  const { data, status, refresh } = useAsyncData('clients', () => (enabled.value ? loaded(() => listClients(request, true)) : Promise.resolve({ data: [], errorKey: null })), {
    watch: [enabled],
  })
  const clients = computed<readonly ClientDto[]>(() => data.value?.data ?? [])

  const run = async (save: () => Promise<ClientDto>): Promise<ClientSaveResult> => {
    try {
      const client = await save()
      await refresh()
      return { ok: true, client }
    } catch (error) {
      return { ok: false, errorKey: clientErrorKey(error), issues: error instanceof ApiFailure ? error.failure.issues : [] }
    }
  }

  return {
    clients,
    active: computed(() => clients.value.filter((client) => !client.archived)),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
    create: (input: ClientInput) => run(() => createClient(request, input)),
    update: (id: string, input: ClientInput) => run(() => updateClient(request, id, input)),
    setArchived: (id: string, archived: boolean) => run(() => setClientArchived(request, id, archived)),
  }
}
