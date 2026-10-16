import type { MigrationIssueDto, MigrationIssueLevel } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { getMigrationIssues } from '@/lib/migration-api'

/** The findings of one level, a page at a time: the list can be long (one per person left out), so it is read on demand. */
export const useMigrationIssues = (migrationId: string, level: MigrationIssueLevel) => {
  const request = useJobsApi()
  const items = ref<readonly MigrationIssueDto[]>([])
  const total = ref(0)
  const page = ref(0)
  const loading = ref(false)
  const errorKey = ref<string | null>(null)

  const more = async (): Promise<void> => {
    if (loading.value) return
    loading.value = true
    errorKey.value = null
    try {
      const next = await getMigrationIssues(request, migrationId, level, page.value + 1)
      items.value = [...items.value, ...next.items]
      total.value = next.total
      page.value = next.page
    } catch (error) {
      errorKey.value = errorKeyOf(error)
    } finally {
      loading.value = false
    }
  }

  return {
    items: computed(() => items.value),
    total: computed(() => total.value),
    loading: computed(() => loading.value),
    errorKey: computed(() => errorKey.value),
    started: computed(() => page.value > 0 || loading.value || errorKey.value !== null),
    hasMore: computed(() => page.value === 0 || items.value.length < total.value),
    more,
  }
}
