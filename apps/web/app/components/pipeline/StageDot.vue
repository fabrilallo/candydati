<script setup lang="ts">
import type { StageTone } from '@/lib/pipeline-board'

/** 8px dot coding the family of a stage: hollow for received, neutral scale for the rest, cobalt for the offer. */
defineProps<{ tone: StageTone }>()
const TONES: Readonly<Record<StageTone, string>> = {
  received: 'border-[1.5px] border-muted-foreground bg-transparent',
  conversation: 'bg-muted-foreground',
  exercise: 'bg-foreground',
  offer: 'bg-primary',
}
</script>

<template>
  <span class="inline-block size-2 shrink-0 rounded-full" :class="TONES[tone]" :data-tone="tone" aria-hidden="true" />
</template>
