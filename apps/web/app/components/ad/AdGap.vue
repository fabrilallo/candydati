<script setup lang="ts">
import { CircleDashedIcon } from '@lucide/vue'
import type { Gap } from '@/lib/ad-gaps'

/** A missing §5.1 element shown where it will appear in the ad. Clicking it focuses the form field. */
withDefaults(defineProps<{ gap: Gap; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
const { t, locale } = useI18n()
const ad = useAdContext()

const sizes = {
  sm: 'min-h-7 px-2.5 py-1 text-xs',
  md: 'min-h-10 w-full px-3.5 py-2.5 text-sm',
  lg: 'min-h-14 w-full px-4 py-3.5 text-[0.9375rem]',
} as const
</script>

<template>
  <button
    type="button"
    :lang="locale"
    class="inline-flex items-center gap-2 rounded-md border border-dashed text-left font-medium transition-colors duration-150 ease-snap active:scale-[0.99]"
    :class="[sizes[size], ad.loudGaps ? 'border-warning/55 bg-warning-soft/55 text-warning hover:border-warning hover:bg-warning-soft' : 'border-input bg-card/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground']"
    data-testid="ad-gap"
    :data-gap="gap.slot"
    @click="ad.jump(gap.fieldId)"
  >
    <CircleDashedIcon class="size-4 shrink-0" aria-hidden="true" />
    <span>{{ t(gap.messageKey) }}</span>
  </button>
</template>
