<script setup lang="ts">
import { FileTextIcon, UploadIcon, XIcon } from '@lucide/vue'
import { CV_ACCEPT, formatBytes } from '@/lib/cv-file'
import type { Translate } from '@/lib/ad-text'
import { Button } from '@/components/ui/button'

/** Drop zone and file button for the CV: shows name and size once chosen, removable. Checks happen in the parent. */
const props = defineProps<{ file: File | null; error?: string | undefined; x: Translate; language: string; disabled?: boolean }>()
const emit = defineEmits<{ change: [file: File | null] }>()
const input = ref<HTMLInputElement | null>(null)
const over = ref(false)

const pick = (event: Event): void => {
  const target = event.target as HTMLInputElement
  emit('change', target.files?.[0] ?? null)
  target.value = ''
}
const drop = (event: DragEvent): void => {
  over.value = false
  const dropped = event.dataTransfer?.files?.[0]
  if (dropped && !props.disabled) emit('change', dropped)
}
const remove = async (): Promise<void> => {
  emit('change', null)
  await nextTick()
  document.getElementById('apply-cv-button')?.focus()
}
</script>

<template>
  <div class="grid gap-1.5" role="group" aria-labelledby="apply-cv-label" :aria-describedby="error ? 'apply-cv-error' : 'apply-cv-hint'">
    <p id="apply-cv-label" class="text-sm font-medium">{{ x('apply.cv.label') }}</p>
    <div
      v-if="!file"
      class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-dashed px-4 py-4 transition-colors duration-150 ease-snap sm:px-5"
      :class="[over ? 'border-primary bg-accent' : 'border-input bg-card', error ? 'border-destructive' : '']"
      data-testid="cv-dropzone"
      @dragenter.prevent="over = true"
      @dragover.prevent="over = true"
      @dragleave.prevent="over = false"
      @drop.prevent="drop"
    >
      <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true"><UploadIcon class="size-5" /></span>
      <div class="grid min-w-0 flex-1 gap-0.5">
        <p class="text-sm font-medium">{{ x('apply.cv.drop') }}</p>
        <p id="apply-cv-hint" class="text-xs text-muted-foreground">{{ x('apply.cv.hint') }}</p>
      </div>
      <Button id="apply-cv-button" type="button" variant="outline" size="sm" :disabled="disabled" data-testid="cv-choose" @click="input?.click()">{{ x('apply.cv.choose') }}</Button>
      <input ref="input" type="file" class="sr-only" tabindex="-1" aria-hidden="true" :accept="CV_ACCEPT" data-testid="cv-input" @change="pick" />
    </div>
    <div v-else class="flex items-center gap-3 rounded-xl border bg-card px-4 py-3" data-testid="cv-file">
      <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true"><FileTextIcon class="size-5" /></span>
      <div class="grid min-w-0 flex-1 gap-0.5">
        <p class="truncate text-sm font-medium">{{ file.name }}</p>
        <p class="figure text-xs text-muted-foreground">{{ formatBytes(file.size, language) }}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" :disabled="disabled" data-testid="cv-remove" :aria-label="x('apply.cv.removeNamed', { name: file.name })" @click="remove"><XIcon aria-hidden="true" />{{ x('apply.cv.remove') }}</Button>
    </div>
    <p v-if="error" id="apply-cv-error" class="text-xs font-medium text-destructive" data-testid="field-error">{{ error }}</p>
  </div>
</template>
