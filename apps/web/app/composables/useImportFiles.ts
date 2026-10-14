import { IMPORT_LIMITS } from '@tt/domain'
import { checkImportFiles, mergeFiles, pathOf } from '@/lib/import-files'

/** The files and folders picked for an import and the client-side limits check. */
export const useImportFiles = (onAdd: () => void) => {
  const files = ref<readonly File[]>([])
  const check = computed(() => checkImportFiles(files.value, IMPORT_LIMITS))
  const add = (added: readonly File[]): void => {
    onAdd()
    files.value = mergeFiles(files.value, added)
  }
  const remove = (path: string): void => {
    files.value = files.value.filter((file) => pathOf(file) !== path)
  }
  const clear = (): void => {
    files.value = []
  }
  return { files, check, add, remove, clear }
}
