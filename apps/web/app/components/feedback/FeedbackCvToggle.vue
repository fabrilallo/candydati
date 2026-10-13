<script setup lang="ts">
import { ChevronDownIcon, FileTextIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { publicFeedbackCvPath } from '@/lib/phase9-contract'

/** The CV behind a toggle, so on a phone the form stays first; the PDF loads only once opened. */
const props = defineProps<{ token: string; name: string; x: Translate }>()
const open = ref(false)
const src = computed(() => publicFeedbackCvPath(props.token))
</script>

<template>
  <div class="grid gap-3" data-testid="feedback-cv">
    <button
      type="button"
      class="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border bg-card px-4 text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      :aria-expanded="open"
      aria-controls="feedback-cv-panel"
      data-testid="feedback-cv-toggle"
      @click="open = !open"
    >
      <span class="flex items-center gap-2"><FileTextIcon class="size-4" aria-hidden="true" />{{ open ? x('feedback.public.cv.hide') : x('feedback.public.cv.show') }}</span>
      <ChevronDownIcon class="size-4 transition-transform duration-150" :class="open && 'rotate-180'" aria-hidden="true" />
    </button>
    <div id="feedback-cv-panel" :hidden="!open">
      <iframe v-if="open" :src="src" :title="x('feedback.public.cv.title', { name })" class="h-[70dvh] min-h-96 w-full rounded-lg border bg-card" referrerpolicy="no-referrer" data-testid="feedback-cv-frame" />
    </div>
  </div>
</template>
