import { toApiRequest } from '@/lib/api-request'
import { AUDIT_PAGE_SIZE, loadAuditPage } from '@/lib/audit-api'

/**
 * Paginated audit log. The page number is plain component state (not the URL), so there is no crawlable
 * query-string space. The incoming cookie is forwarded explicitly when rendering on the server.
 */
export const useAuditLog = () => {
  const page = ref(1)
  const cookie = useRequestHeaders(['cookie'])
  const request = toApiRequest((url, options) => $fetch.raw(url, { ...options, headers: { ...options.headers, ...cookie } }))
  const { data, status, refresh } = useAsyncData('audit-log', () => loadAuditPage(request, page.value, AUDIT_PAGE_SIZE), { watch: [page] })

  const goTo = (next: number): void => {
    page.value = Math.max(1, next)
  }

  return {
    page,
    events: computed(() => data.value?.page?.events ?? []),
    meta: computed(() => data.value?.page?.meta ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
    goTo,
  }
}
