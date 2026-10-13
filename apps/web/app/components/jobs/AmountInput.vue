<script setup lang="ts">
import { amountDisplay, caretAfterDigits, digitsOnly } from '@/lib/editor-inputs'

/**
 * Whole amount with thousands separators while typing (`45.000`), stored as digits (`45000`). The caret stays
 * after the same digit when a separator appears. Same look as `Input`, with the currency symbol inside.
 */
const props = defineProps<{ id: string; modelValue: string; language: string; suffix: string; disabled?: boolean; invalid?: boolean; describedBy?: string | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const display = computed(() => amountDisplay(props.modelValue, props.language))

const onInput = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const before = (input.value.slice(0, input.selectionStart ?? input.value.length).match(/\d/g) ?? []).length
  const digits = digitsOnly(input.value)
  const formatted = amountDisplay(digits, props.language)
  const leadingZeros = input.value.replace(/\D/g, '').length - digits.length
  input.value = formatted
  const caret = caretAfterDigits(formatted, Math.max(0, before - leadingZeros))
  input.setSelectionRange?.(caret, caret)
  if (digits !== props.modelValue) emit('update:modelValue', digits)
}
</script>

<template>
  <div class="relative">
    <input
      :id="id"
      :value="display"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      class="figure h-9 w-full min-w-0 rounded-md border border-input bg-card py-1 pr-9 pl-3 text-base shadow-xs outline-none transition-[color,border-color,box-shadow] duration-150 ease-snap placeholder:text-muted-foreground/80 hover:border-foreground/25 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/15 aria-invalid:focus-visible:ring-destructive/25 md:text-sm"
      @input="onInput"
    >
    <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">{{ suffix }}</span>
  </div>
</template>
