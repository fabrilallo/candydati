<script setup lang="ts">
import { formatDate } from '@/lib/format'
import type { ResponseInput } from '@/lib/response-countdown'
import { responseSticker, type StickerState } from '@/lib/response-sticker'

/**
 * The response promise as the signature sticker (docs/DESIGN-SYSTEM.md §3.1): a round, slightly rotated badge with the
 * days left. White on track, yellow within 48 hours, coral once late; the words change too ("!" and "ritardo"), and
 * screen readers hear the full sentence. Renders nothing when no promise is running.
 */
const props = defineProps<{ application: ResponseInput; now: Date }>()
const { t, locale } = useI18n()
const sticker = computed(() => responseSticker(props.application, props.now))
const TONES: Readonly<Record<StickerState, string>> = {
  on_track: 'bg-card text-foreground',
  due_soon: 'bg-highlight text-highlight-foreground',
  overdue: 'bg-alert text-alert-foreground',
}
const label = computed(() => (sticker.value ? t(sticker.value.labelKey, { count: sticker.value.count }, sticker.value.count) : ''))
const title = computed(() => (props.application.responseDueAt ? t('response.dueAt', { date: formatDate(props.application.responseDueAt, locale.value) }) : label.value))
</script>

<template>
  <span
    v-if="sticker"
    role="img"
    :aria-label="label"
    :title="title"
    class="figure flex size-[3.75rem] shrink-0 -rotate-8 flex-col items-center justify-center gap-0.5 rounded-full border-2 border-ink leading-none select-none"
    :class="TONES[sticker.state]"
    :data-state="sticker.state"
    data-testid="response-sticker"
  >
    <span class="text-lg font-extrabold tracking-tight" aria-hidden="true">{{ t(sticker.figureKey, { count: sticker.count }) }}</span>
    <span class="text-[0.5625rem] font-bold tracking-tight" aria-hidden="true">{{ t(sticker.captionKey) }}</span>
  </span>
</template>
