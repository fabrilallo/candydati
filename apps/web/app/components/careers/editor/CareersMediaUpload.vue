<script setup lang="ts">
import { UploadIcon } from '@lucide/vue'
import { maxBytesOf, MEDIA_LIMITS, type CareersMediaAssetDto, type MediaKind } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorKeyOf } from '@/lib/auth-errors'
import { ACCEPT, fileProblem, megabytes } from '@/lib/careers-media-view'
import type { CareersMediaLibrary, MediaUpload } from '@/composables/useCareersMediaLibrary'

/**
 * Upload of one file to the library. Type and size are checked here first (the api checks again from the bytes);
 * an image needs its description before it is sent, in at least one language. Progress is shown and can be cancelled.
 */
const props = defineProps<{ kind: MediaKind; library: CareersMediaLibrary }>()
const emit = defineEmits<{ uploaded: [asset: CareersMediaAssetDto] }>()
const { t } = useI18n()

const file = ref<File | null>(null)
const alt = ref({ it: '', en: '' })
const progress = ref<number | null>(null)
const errorKey = ref<string | null>(null)
const running = shallowRef<MediaUpload | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const needsAlt = computed(() => props.kind === 'image')

const choose = (event: Event): void => {
  const chosen = (event.target as HTMLInputElement).files?.[0] ?? null
  const problem = chosen ? fileProblem(chosen, props.kind) : null
  file.value = problem ? null : chosen
  errorKey.value = problem ? `careersEditor.media.errors.${problem}` : null
}

const reset = (): void => {
  file.value = null
  alt.value = { it: '', en: '' }
  if (fileInput.value) fileInput.value.value = ''
}

const upload = async (): Promise<void> => {
  if (!file.value) {
    errorKey.value = 'careersEditor.media.errors.no_file'
    return
  }
  if (needsAlt.value && alt.value.it.trim() === '' && alt.value.en.trim() === '') {
    errorKey.value = 'careersEditor.media.errors.alt_required'
    return
  }
  errorKey.value = null
  progress.value = 0
  running.value = props.library.upload({ file: file.value, alt: needsAlt.value ? alt.value : {} }, (percent) => (progress.value = percent))
  try {
    const asset = await running.value.done
    reset()
    emit('uploaded', asset)
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    running.value = null
    progress.value = null
  }
}
</script>

<template>
  <form class="grid gap-4 rounded-lg border bg-muted/40 px-4 py-4" novalidate data-testid="careers-media-upload-form" @submit.prevent="upload">
    <div class="grid gap-1.5">
      <Label for="cp-media-file">{{ t(`careersEditor.media.file.${kind}`) }}</Label>
      <input
        id="cp-media-file"
        ref="fileInput"
        type="file"
        :accept="ACCEPT[kind]"
        class="block w-full text-sm file:mr-3 file:h-8 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:text-sm file:font-medium"
        aria-describedby="cp-media-file-hint"
        :disabled="running !== null"
        data-testid="careers-media-file"
        @change="choose"
      >
      <p id="cp-media-file-hint" class="text-xs text-muted-foreground">{{ t(`careersEditor.media.limits.${kind}`, { max: megabytes(maxBytesOf(kind)) }) }}</p>
    </div>
    <div v-if="needsAlt" class="grid gap-3 sm:grid-cols-2">
      <div v-for="code in (['it', 'en'] as const)" :key="code" class="grid gap-1.5">
        <Label :for="`cp-media-alt-${code}`">{{ t('careersEditor.media.alt', { language: t(`locales.${code}`) }) }}</Label>
        <Input :id="`cp-media-alt-${code}`" v-model="alt[code]" :maxlength="MEDIA_LIMITS.altMax" :disabled="running !== null" :data-testid="`careers-media-alt-${code}`" />
      </div>
      <p class="text-xs text-muted-foreground sm:col-span-2">{{ t('careersEditor.media.altHint') }}</p>
    </div>
    <div v-if="progress !== null" class="grid gap-1.5">
      <div
        class="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="progress"
        :aria-label="t('careersEditor.media.progress')"
        data-testid="careers-media-progress"
      >
        <div class="h-full rounded-full bg-primary transition-[width] duration-150 ease-snap" :style="{ width: `${progress}%` }" />
      </div>
      <p class="figure text-xs text-muted-foreground" aria-hidden="true">{{ progress }}%</p>
    </div>
    <FormAlert :message-key="errorKey" />
    <div class="flex flex-wrap gap-2">
      <Button type="submit" size="sm" :disabled="running !== null" data-testid="careers-media-upload">
        <UploadIcon aria-hidden="true" />{{ t('careersEditor.media.upload') }}
      </Button>
      <Button v-if="running" type="button" variant="ghost" size="sm" data-testid="careers-media-cancel" @click="running.cancel()">{{ t('common.cancel') }}</Button>
    </div>
  </form>
</template>
