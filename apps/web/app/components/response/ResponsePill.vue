<script setup lang="ts">
import { CheckIcon, TimerIcon } from '@lucide/vue'
import { formatDate } from '@/lib/format'
import { responseCountdown, type CountdownTone, type ResponseInput } from '@/lib/response-countdown'

/**
 * The promise "risposta entro N giorni" for one application (docs/DESIGN-SYSTEM.md: neutral on track, the yellow accent when near,
 * the coral alert when late; "Risposto" stays quiet). Renders nothing for closed applications or without a deadline.
 */
const props = defineProps<{ application: ResponseInput; now: Date }>()
const { t, locale } = useI18n()
const countdown = computed(() => responseCountdown(props.application, props.now))
const TONES: Readonly<Record<CountdownTone, string>> = {
  neutral: 'bg-secondary text-secondary-foreground',
  warning: 'bg-highlight text-highlight-foreground',
  destructive: 'bg-alert text-alert-foreground',
  quiet: 'text-muted-foreground',
}
const title = computed(() => (props.application.responseDueAt && countdown.value?.state !== 'answered' ? t('response.dueAt', { date: formatDate(props.application.responseDueAt, locale.value) }) : t('response.label')))
</script>

<template>
  <span
    v-if="countdown"
    class="figure inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full text-xs font-medium whitespace-nowrap"
    :class="[TONES[countdown.tone], countdown.tone === 'quiet' ? 'px-0' : 'px-2.5']"
    :title="title"
    :data-state="countdown.state"
    data-testid="response-pill"
  >
    <CheckIcon v-if="countdown.tone === 'quiet'" class="size-3.5" aria-hidden="true" />
    <TimerIcon v-else class="size-3.5" aria-hidden="true" />
    <span class="sr-only">{{ t('response.label') }}:</span>
    {{ t(countdown.key, { count: countdown.count }, countdown.count) }}
  </span>
</template>
