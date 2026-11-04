<script setup lang="ts">
import { EVIDENCE_MAX, type Observation } from '@candydati/domain'
import type { Translate } from '@/lib/ad-text'
import type { ObservationDraft, ObservationError } from '@/lib/observation-form'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'

/**
 * One criterion of the scorecard (PRODUCT.md §2.4): three words as a segmented radio group (one keyboard stop, arrows
 * move) and the evidence behind the word. Never a number, a scale or stars.
 */
const props = defineProps<{
  criterion: { readonly id: string; readonly label: string }
  options: readonly Observation[]
  modelValue: ObservationDraft
  errors: readonly ObservationError[]
  x: Translate
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: ObservationDraft] }>()
const group = ref<HTMLElement | null>(null)
const base = computed(() => `criterion-${props.criterion.id}`)
const tabStop = computed(() => props.modelValue.observation ?? props.options[0])
const errorId = computed(() => `${base.value}-error`)

const choose = (observation: Observation): void => emit('update:modelValue', { ...props.modelValue, observation })
const onKey = (event: KeyboardEvent, value: Observation): void => {
  const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
  if (delta === 0) return
  event.preventDefault()
  const next = props.options[(props.options.indexOf(value) + delta + props.options.length) % props.options.length]!
  choose(next)
  void nextTick(() => group.value?.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus())
}
const setEvidence = (value: string | number): void => emit('update:modelValue', { ...props.modelValue, evidence: String(value) })
</script>

<template>
  <fieldset class="grid gap-3 border-0 p-0" :data-testid="`observation-${criterion.id}`" :aria-describedby="errors.length ? errorId : undefined">
    <legend :id="`${base}-title`" class="text-base font-medium">{{ criterion.label }}</legend>
    <div
      ref="group"
      role="radiogroup"
      :aria-labelledby="`${base}-title`"
      :aria-invalid="errors.includes('observation_required') || undefined"
      class="grid gap-2 sm:grid-cols-3"
    >
      <button
        v-for="option in options"
        :key="option"
        type="button"
        role="radio"
        :aria-checked="modelValue.observation === option"
        :tabindex="tabStop === option ? 0 : -1"
        :disabled="disabled"
        :data-value="option"
        :data-testid="`observation-${criterion.id}-${option}`"
        :class="
          cn(
            'min-h-12 w-full rounded-lg border bg-card px-4 text-base font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60',
            modelValue.observation === option ? 'border-primary bg-accent text-accent-foreground ring-1 ring-primary' : 'border-input hover:border-foreground/25',
            errors.includes('observation_required') && 'border-destructive',
          )
        "
        @click="choose(option)"
        @keydown="onKey($event, option)"
      >
        {{ x(`feedback.observation.${option}`) }}
      </button>
    </div>
    <label :for="`${base}-evidence`" class="text-sm font-medium">{{ x('feedback.public.evidence.label') }}</label>
    <Textarea
      :id="`${base}-evidence`"
      :model-value="modelValue.evidence"
      class="min-h-24 text-base md:text-base"
      :maxlength="EVIDENCE_MAX"
      :placeholder="x('feedback.public.evidence.placeholder')"
      :aria-invalid="errors.includes('evidence_required') || errors.includes('evidence_too_long') || undefined"
      :aria-describedby="errors.length ? errorId : undefined"
      :disabled="disabled"
      :data-testid="`evidence-${criterion.id}`"
      @update:model-value="setEvidence"
    />
    <ul v-if="errors.length" :id="errorId" class="grid gap-0.5 text-sm text-destructive" :data-testid="`observation-error-${criterion.id}`">
      <li v-for="error in errors" :key="error">{{ x(`feedback.public.evidence.errors.${error}`, { max: EVIDENCE_MAX }) }}</li>
    </ul>
  </fieldset>
</template>
