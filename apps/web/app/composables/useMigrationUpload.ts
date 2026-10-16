import { errorKeyOf } from '@/lib/auth-errors'
import type { XhrLike } from '@/lib/import-upload'
import { checkPackageFile, uploadMigrationPackage } from '@/lib/migration-upload'

/** The browser's `XMLHttpRequest` through the seam (its handler types are DOM-specific, the shape is the same). */
const browserXhr = (): XhrLike => new XMLHttpRequest() as unknown as XhrLike

/**
 * The package ZIP to upload: one file, checked as a courtesy (the api checks again), sent with progress and a way to stop.
 * On success the caller opens the migration.
 */
export const useMigrationUpload = (makeXhr: () => XhrLike = browserXhr) => {
  const file = ref<File | null>(null)
  const errorKey = ref<string | null>(null)
  const progress = ref<number | null>(null)
  let cancelUpload: (() => void) | null = null

  const pick = (files: readonly File[]): void => {
    const [first] = files
    errorKey.value = null
    if (!first) return
    const check = checkPackageFile(first)
    if (!check.ok) {
      file.value = null
      errorKey.value = `migrations.upload.errors.${check.key}`
      return
    }
    file.value = first
  }
  const clear = (): void => void ((file.value = null), (errorKey.value = null))

  const ready = computed(() => file.value !== null && progress.value === null)

  const upload = async (): Promise<string | null> => {
    const chosen = file.value
    if (!chosen || progress.value !== null) return null
    errorKey.value = null
    progress.value = 0
    const run = uploadMigrationPackage(chosen, chosen.name, (value) => (progress.value = value), makeXhr)
    cancelUpload = run.cancel
    try {
      return (await run.done).id
    } catch (error) {
      errorKey.value = errorKeyOf(error)
      return null
    } finally {
      cancelUpload = null
      progress.value = null
    }
  }

  onBeforeUnmount(() => cancelUpload?.())

  return {
    file: computed(() => file.value),
    progress: computed(() => progress.value),
    errorKey: computed(() => errorKey.value),
    ready,
    pick,
    clear,
    upload,
    cancel: (): void => cancelUpload?.(),
  }
}
