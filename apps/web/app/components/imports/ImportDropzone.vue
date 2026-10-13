<script setup lang="ts">
import { FolderOpenIcon, UploadIcon } from '@lucide/vue'
import { IMPORT_ACCEPT } from '@/lib/import-files'
import { Button } from '@/components/ui/button'

/**
 * Drop zone of the import: files and whole folders, by drag and drop or with the two pickers (files, folder via
 * `webkitdirectory`). Files found inside a dropped folder keep their path, so the worker can match them by name.
 */
defineProps<{ disabled: boolean; limits: string }>()
const emit = defineEmits<{ add: [files: File[]] }>()
const { t } = useI18n()
const filesInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const over = ref(false)

const withPath = (file: File, path: string): File => {
  const copy = new File([file], file.name, { type: file.type, lastModified: file.lastModified })
  Object.defineProperty(copy, 'webkitRelativePath', { value: path })
  return copy
}

const readBatch = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => new Promise((resolve, reject) => reader.readEntries(resolve, reject))

const readEntry = async (entry: FileSystemEntry, prefix: string): Promise<File[]> => {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    return [prefix ? withPath(file, `${prefix}${file.name}`) : file]
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const entries: FileSystemEntry[] = []
  for (let batch = await readBatch(reader); batch.length > 0; batch = await readBatch(reader)) entries.push(...batch)
  const nested = await Promise.all(entries.map((child) => readEntry(child, `${prefix}${entry.name}/`)))
  return nested.flat()
}

const drop = async (event: DragEvent): Promise<void> => {
  over.value = false
  const items = [...(event.dataTransfer?.items ?? [])]
  const entries = items.map((item) => item.webkitGetAsEntry?.() ?? null)
  try {
    if (entries.some((entry) => entry !== null)) {
      const files = await Promise.all(entries.filter((entry): entry is FileSystemEntry => entry !== null).map((entry) => readEntry(entry, '')))
      emit('add', files.flat())
    } else emit('add', [...(event.dataTransfer?.files ?? [])])
  } catch (error) {
    console.error('[import] reading the dropped folder failed', error instanceof Error ? error.message : error)
    emit('add', [...(event.dataTransfer?.files ?? [])])
  }
}

const picked = (event: Event): void => {
  const input = event.target as HTMLInputElement
  emit('add', [...(input.files ?? [])])
  input.value = ''
}
</script>

<template>
  <div
    class="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors duration-150 ease-snap"
    :class="over ? 'border-primary bg-accent/50' : 'border-input bg-card'"
    data-testid="import-dropzone"
    @dragover.prevent="over = !disabled"
    @dragleave="over = false"
    @drop.prevent="disabled ? undefined : drop($event)"
  >
    <span class="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><UploadIcon class="size-5" /></span>
    <p class="text-[0.9375rem] font-medium">{{ t('imports.files.drop') }}</p>
    <div class="flex flex-wrap justify-center gap-2">
      <Button type="button" variant="outline" size="sm" :disabled="disabled" data-testid="import-choose-files" @click="filesInput?.click()"><UploadIcon aria-hidden="true" />{{ t('imports.files.chooseFiles') }}</Button>
      <Button type="button" variant="outline" size="sm" :disabled="disabled" data-testid="import-choose-folder" @click="folderInput?.click()"><FolderOpenIcon aria-hidden="true" />{{ t('imports.files.chooseFolder') }}</Button>
    </div>
    <p class="max-w-md text-xs text-muted-foreground">{{ limits }}</p>
    <input ref="filesInput" type="file" multiple :accept="IMPORT_ACCEPT" class="sr-only" tabindex="-1" aria-hidden="true" data-testid="import-files-input" @change="picked" />
    <input ref="folderInput" type="file" multiple webkitdirectory class="sr-only" tabindex="-1" aria-hidden="true" data-testid="import-folder-input" @change="picked" />
  </div>
</template>
