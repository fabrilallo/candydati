import { errorKeyOf } from '@/lib/auth-errors'
import type { XhrLike } from '@/lib/import-upload'
import { checkCvsFile, checkSheetFile, uploadConnectorFiles, type FileCheck } from '@/lib/migration-files'

const browserXhr = (): XhrLike => new XMLHttpRequest() as unknown as XhrLike

/** One file slot with its courtesy check: the chosen file, or the key of why it was refused. */
const useFileSlot = (check: (file: File) => FileCheck) => {
  const file = ref<File | null>(null)
  const errorKey = ref<string | null>(null)
  const pick = (files: readonly File[]): void => {
    const [first] = files
    errorKey.value = null
    if (!first) return
    const result = check(first)
    file.value = result.ok ? first : null
    if (!result.ok) errorKey.value = `migrations.files.errors.${result.key}`
  }
  const clear = (): void => void ((file.value = null), (errorKey.value = null))
  return { file, errorKey, pick, clear }
}

/**
 * The export of a file-based connector: a spreadsheet (required) and a ZIP of CVs (optional), checked as a courtesy (the
 * api checks again), sent with progress and a way to stop. On success the caller opens the migration.
 */
export const useConnectorFilesUpload = (connectorId: string, makeXhr: () => XhrLike = browserXhr) => {
  const sheet = useFileSlot(checkSheetFile)
  const cvs = useFileSlot(checkCvsFile)
  const errorKey = ref<string | null>(null)
  const progress = ref<number | null>(null)
  let cancelUpload: (() => void) | null = null

  const ready = computed(() => sheet.file.value !== null && progress.value === null)

  const upload = async (): Promise<string | null> => {
    const chosen = sheet.file.value
    if (!chosen || progress.value !== null) return null
    errorKey.value = null
    progress.value = 0
    const run = uploadConnectorFiles(connectorId, { sheet: chosen, cvs: cvs.file.value }, (value) => (progress.value = value), makeXhr)
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
    sheet: computed(() => sheet.file.value),
    cvs: computed(() => cvs.file.value),
    sheetErrorKey: computed(() => sheet.errorKey.value),
    cvsErrorKey: computed(() => cvs.errorKey.value),
    errorKey: computed(() => errorKey.value),
    progress: computed(() => progress.value),
    ready,
    pickSheet: sheet.pick,
    pickCvs: cvs.pick,
    clearSheet: sheet.clear,
    clearCvs: cvs.clear,
    upload,
    cancel: (): void => cancelUpload?.(),
  }
}
