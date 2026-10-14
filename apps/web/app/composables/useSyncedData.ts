import { computed, shallowRef, watch, type Ref } from 'vue'

/**
 * A local copy of a loaded payload that composables edit in place of reloading, and that follows fresh loads.
 * It reads the payload when it is read, not once at setup: on the server the fetch resolves after setup and before the
 * render, so a copy taken at setup rendered a skeleton there while the browser (which starts from the payload) rendered
 * the content, a hydration mismatch.
 */
export const useSyncedData = <T>(data: Ref<{ readonly data: T | null } | null | undefined>): Ref<T | null> => {
  const edited = shallowRef<{ readonly value: T | null } | null>(null)
  watch(data, () => {
    edited.value = null
  })
  return computed<T | null, T | null>({
    get: (): T | null => (edited.value ? edited.value.value : (data.value?.data ?? null)),
    set: (value: T | null) => {
      edited.value = { value }
    },
  })
}
