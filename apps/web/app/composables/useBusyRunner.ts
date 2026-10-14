import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'

/**
 * `run(kind, action, successKey)`: marks `busy` while `action` runs, toasts the success message (when given) or the
 * translated error, and resolves with the result, or null when it failed.
 */
export const useBusyRunner = <K extends string>(busy: Ref<K | null>) => {
  const { t } = useI18n()
  return async <T>(kind: K, action: () => Promise<T>, successKey: string | null): Promise<T | null> => {
    busy.value = kind
    try {
      const result = await action()
      if (successKey) toast.success(t(successKey))
      return result
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
      return null
    } finally {
      busy.value = null
    }
  }
}

/** A local copy of a loaded payload that composables edit in place of reloading, and that follows fresh loads. */
export const useSyncedData = <T>(data: Ref<{ readonly data: T | null } | null | undefined>): Ref<T | null> => {
  const local = ref(data.value?.data ?? null) as Ref<T | null>
  watch(data, (fresh) => {
    local.value = fresh?.data ?? null
  })
  return local
}
