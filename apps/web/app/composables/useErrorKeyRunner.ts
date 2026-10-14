import { errorKeyOf } from '@/lib/auth-errors'

/** `run(action)`: busy while it runs; a failure leaves its translation key in `errorKey` and resolves null. */
export const useErrorKeyRunner = () => {
  const busy = ref(false)
  const errorKey = ref<string | null>(null)
  const run = async <T>(action: () => Promise<T>): Promise<T | null> => {
    busy.value = true
    errorKey.value = null
    try {
      return await action()
    } catch (error) {
      errorKey.value = errorKeyOf(error)
      return null
    } finally {
      busy.value = false
    }
  }
  return { busy, errorKey, run }
}
