<script setup lang="ts">
import { FEEDBACK_RECOMMENDATIONS, type FeedbackRecommendation } from '@/lib/phase9-contract'
import type { Translate } from '@/lib/ad-text'
import { cn } from '@/lib/utils'

/**
 * The interviewer's indication for the next stage: three big full-width choices (radio group semantics, one stop for
 * the keyboard, arrows move). It is an opinion for whoever decides, never a decision and never a score.
 */
const props = defineProps<{ modelValue: FeedbackRecommendation | null; x: Translate; invalid?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: FeedbackRecommendation] }>()
const options = FEEDBACK_RECOMMENDATIONS
const group = ref<HTMLElement | null>(null)
const tabStop = computed(() => props.modelValue ?? options[0])

const step = (current: FeedbackRecommendation, delta: number): void => {
  const next = options[(options.indexOf(current) + delta + options.length) % options.length]!
  emit('update:modelValue', next)
  void nextTick(() => group.value?.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus())
}
const onKey = (event: KeyboardEvent, value: FeedbackRecommendation): void => {
  const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
  if (delta === 0) return
  event.preventDefault()
  step(value, delta)
}
</script>

<template>
  <fieldset class="grid gap-3 border-0 p-0" data-testid="recommendation">
    <legend id="recommendation-title" class="text-lg font-semibold tracking-tight">{{ x('feedback.public.recommendation.title') }}</legend>
    <p id="recommendation-note" class="text-[0.9375rem] text-pretty text-muted-foreground">{{ x('feedback.public.recommendation.note') }}</p>
    <div ref="group" role="radiogroup" aria-labelledby="recommendation-title" aria-describedby="recommendation-note" :aria-invalid="invalid || undefined" class="grid gap-2.5 sm:grid-cols-3">
      <button
        v-for="option in options"
        :key="option"
        type="button"
        role="radio"
        :aria-checked="modelValue === option"
        :tabindex="tabStop === option ? 0 : -1"
        :disabled="disabled"
        :data-value="option"
        :data-testid="`recommendation-${option}`"
        :class="
          cn(
            'min-h-14 w-full rounded-lg border bg-card px-4 text-base font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60',
            modelValue === option ? 'border-primary bg-accent text-accent-foreground ring-1 ring-primary' : 'border-input hover:border-foreground/25',
            invalid && modelValue === null && 'border-destructive',
          )
        "
        @click="emit('update:modelValue', option)"
        @keydown="onKey($event, option)"
      >
        {{ x(`feedback.recommendation.${option}`) }}
      </button>
    </div>
  </fieldset>
</template>
