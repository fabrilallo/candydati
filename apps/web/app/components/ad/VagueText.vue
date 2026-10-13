<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { splitHighlights } from '@/lib/vague-highlight'

/**
 * Text of the ad. In the preview, the vague phrases found by the last analysis are underlined; each opens a small
 * popover with the suggested rewrite. In public mode there are no phrases, so this is plain text.
 */
const props = defineProps<{ text: string }>()
const ad = useAdContext()
const { t, locale } = useI18n()
const parts = computed(() => splitHighlights(props.text, ad.value.phrases))
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <template v-if="!part.phrase">{{ part.text }}</template>
    <PopoverRoot v-else>
      <PopoverTrigger
        class="rounded-[3px] bg-warning-soft/70 text-left underline decoration-warning decoration-wavy decoration-1 underline-offset-[5px] transition-colors duration-150 ease-snap hover:bg-warning-soft"
        data-testid="vague-mark"
      >
        {{ part.text }}<span class="sr-only" :lang="locale"> ({{ t('job.preview.vagueOpen') }})</span>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          side="top"
          :side-offset="8"
          :collision-padding="12"
          :lang="locale"
          class="z-50 grid w-[min(20rem,calc(100vw-2rem))] gap-2 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg duration-200 ease-snap data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
          data-testid="vague-popover"
        >
          <p class="text-xs font-medium text-warning">{{ t('job.preview.vague', { category: t(`quality.categories.${part.phrase.category}`) }) }}</p>
          <p class="text-xs text-muted-foreground">{{ t('job.quality.suggestion') }}</p>
          <p :lang="ad.language" class="leading-relaxed">{{ part.phrase.suggestion }}</p>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </template>
</template>
