import { toast } from 'vue-sonner'
import { ApiFailure } from '@/lib/api-call'
import { errorKeyOf } from '@/lib/auth-errors'
import { commitErrorKey } from '@/lib/migration-view'

export type MigrationBusy = 'choices' | 'commit' | 'undo' | null

/**
 * `run(kind, action)`: busy while it runs. A failure of a choice leaves its key for the screen, a refused commit leaves
 * its words (unmapped stages with their count), anything else is a toast. A 409 reloads: the migration moved on.
 */
export const useMigrationRunner = (reload: () => Promise<void>) => {
  const { t } = useI18n()
  const busy = ref<MigrationBusy>(null)
  const errorKey = ref<string | null>(null)
  const refusal = ref<{ readonly key: string; readonly count?: number } | null>(null)

  const run = async <T>(kind: Exclude<MigrationBusy, null>, action: () => Promise<T>): Promise<T | null> => {
    busy.value = kind
    errorKey.value = null
    refusal.value = null
    try {
      return await action()
    } catch (error) {
      const known = kind === 'commit' ? commitErrorKey(error) : null
      if (known) refusal.value = known
      else if (kind === 'choices') errorKey.value = errorKeyOf(error)
      else toast.error(t(errorKeyOf(error)))
      if (error instanceof ApiFailure && error.failure.status === 409) await reload()
      return null
    } finally {
      busy.value = null
    }
  }

  return { busy, errorKey, refusal, run }
}
