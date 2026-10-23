<script setup lang="ts">
import { UploadIcon, XIcon } from '@lucide/vue'
import { formatBytes } from '@/lib/cv-file'
import { PACKAGE_LIMIT_BYTES } from '@/lib/migration-upload'
import { Button } from '@/components/ui/button'

/**
 * Step 2 "Package": the ZIP to upload, by drag and drop or the file picker. The check here is a courtesy (the api checks
 * the content again); the upload shows its progress and can be stopped. On success the migration page takes over.
 */
const emit = defineEmits<{ uploaded: [migrationId: string]; back: [] }>()
const { t, locale } = useI18n()
const upload = useMigrationUpload()
const input = ref<HTMLInputElement | null>(null)
const over = ref(false)
const uploading = computed(() => upload.progress.value !== null)
const limit = computed(() => formatBytes(PACKAGE_LIMIT_BYTES, locale.value))

const picked = (event: Event): void => {
  const target = event.target as HTMLInputElement
  upload.pick([...(target.files ?? [])])
  target.value = ''
}
const drop = (event: DragEvent): void => {
  over.value = false
  if (!uploading.value) upload.pick([...(event.dataTransfer?.files ?? [])])
}
const send = async (): Promise<void> => {
  const id = await upload.upload()
  if (id) emit('uploaded', id)
}
</script>

<template>
  <form class="grid gap-6" novalidate data-testid="migration-upload-step" @submit.prevent="send">
    <div class="grid gap-1">
      <h2 id="migration-upload-title" class="text-lg font-semibold tracking-tight">{{ t('migrations.upload.title') }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.upload.intro') }}</p>
    </div>

    <div
      class="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors duration-150 ease-snap"
      :class="over ? 'border-primary bg-accent/50' : 'border-input bg-card'"
      data-testid="migration-dropzone"
      @dragover.prevent="over = !uploading"
      @dragleave="over = false"
      @drop.prevent="drop"
    >
      <span class="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><UploadIcon class="size-5" /></span>
      <p class="text-[0.9375rem] font-medium">{{ t('migrations.upload.drop') }}</p>
      <Button type="button" variant="outline" size="sm" :disabled="uploading" data-testid="migration-choose" @click="input?.click()"><UploadIcon aria-hidden="true" />{{ t('migrations.upload.choose') }}</Button>
      <p class="text-xs text-muted-foreground">{{ t('migrations.upload.limit', { size: limit }) }}</p>
      <input ref="input" type="file" accept=".zip,application/zip" class="sr-only" tabindex="-1" aria-hidden="true" data-testid="migration-input" @change="picked" />
    </div>

    <div v-if="upload.file.value" class="flex flex-wrap items-center gap-3 rounded-xl panel px-5 py-4 sm:px-6" data-testid="migration-picked">
      <p class="sr-only">{{ t('migrations.upload.picked') }}</p>
      <span class="min-w-0 flex-1 truncate font-mono text-xs" :title="upload.file.value.name">{{ upload.file.value.name }}</span>
      <span class="figure shrink-0 text-xs text-muted-foreground">{{ formatBytes(upload.file.value.size, locale) }}</span>
      <Button type="button" variant="ghost" size="icon" class="size-7" :disabled="uploading" :aria-label="t('migrations.upload.remove', { name: upload.file.value.name })" @click="upload.clear"><XIcon aria-hidden="true" /></Button>
    </div>

    <div class="grid gap-3 border-t pt-6">
      <FormAlert :message-key="upload.errorKey.value" />
      <div v-if="uploading" class="grid gap-2" role="status" data-testid="migration-upload-progress">
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="figure font-medium">{{ t('migrations.upload.uploading', { percent: upload.progress.value }) }}</span>
          <Button type="button" variant="ghost" size="sm" @click="upload.cancel">{{ t('migrations.upload.cancel') }}</Button>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div class="h-full rounded-full bg-primary transition-[width] duration-150 ease-snap motion-reduce:transition-none" :style="{ width: `${upload.progress.value}%` }" />
        </div>
      </div>
      <div v-else class="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" @click="emit('back')">{{ t('migrations.upload.back') }}</Button>
        <Button type="submit" :disabled="!upload.ready.value" data-testid="migration-upload">{{ t('migrations.upload.send') }}</Button>
      </div>
    </div>
  </form>
</template>
