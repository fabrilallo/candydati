import { errorKeyOf } from '@/lib/auth-errors'
import { createWebhook, deleteWebhook, listWebhooks, testWebhook, updateWebhook, type WebhookInput } from '@/lib/automation-api'
import { loaded } from '@/lib/job-api'
import type { WebhookCreatedDto, WebhookEndpointDto } from '@candydati/domain'

/** The organization's webhook endpoints (`webhook:manage`). The secret of a new one is returned once and never kept. */
export const useWebhooks = () => {
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('webhooks', () => loaded(() => listWebhooks(request)))
  const endpoints = useSyncedData<readonly WebhookEndpointDto[]>(data)
  const busy = ref<string | null>(null)
  const createErrorKey = ref<string | null>(null)

  const run = useBusyRunner(busy)

  const create = async (input: WebhookInput): Promise<WebhookCreatedDto | null> => {
    busy.value = 'new'
    createErrorKey.value = null
    try {
      const created = await createWebhook(request, input)
      const { secret: _secret, ...endpoint } = created
      endpoints.value = [...(endpoints.value ?? []), endpoint]
      return created
    } catch (error) {
      createErrorKey.value = errorKeyOf(error)
      return null
    } finally {
      busy.value = null
    }
  }

  const setEnabled = async (endpoint: WebhookEndpointDto, enabled: boolean): Promise<void> => {
    const fresh = await run(endpoint.id, () => updateWebhook(request, endpoint.id, { url: endpoint.url, events: endpoint.events, enabled }), null)
    if (fresh) endpoints.value = (endpoints.value ?? []).map((item) => (item.id === fresh.id ? fresh : item))
  }

  const remove = async (endpoint: WebhookEndpointDto): Promise<boolean> => {
    const done = await run(endpoint.id, () => deleteWebhook(request, endpoint.id).then(() => true), 'webhooks.deleted')
    if (done) endpoints.value = (endpoints.value ?? []).filter((item) => item.id !== endpoint.id)
    return done === true
  }

  const test = (endpoint: WebhookEndpointDto): Promise<boolean> => run(endpoint.id, () => testWebhook(request, endpoint.id).then(() => true), 'webhooks.testSent').then((done) => done === true)

  return {
    endpoints: computed(() => endpoints.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    createErrorKey: computed(() => createErrorKey.value),
    clearError: () => {
      createErrorKey.value = null
    },
    refresh,
    create,
    setEnabled,
    remove,
    test,
  }
}
