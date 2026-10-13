<script setup lang="ts">
/**
 * A short set of mutually exclusive choices, all visible (work mode, editor view). A radio group: one tab stop,
 * arrow keys move and select, Home/End jump. Focusing the group by id (gap jump) lands on the checked option.
 */
export interface SegmentOption {
  readonly value: string
  readonly label: string
}

const props = defineProps<{
  id: string
  modelValue: string
  options: readonly SegmentOption[]
  label: string
  disabled?: boolean
  invalid?: boolean
  describedBy?: string | undefined
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const buttons = ref<HTMLButtonElement[]>([])
const checkedIndex = computed(() => props.options.findIndex((option) => option.value === props.modelValue))
const tabStop = computed(() => Math.max(0, checkedIndex.value))

const select = (index: number): void => {
  const option = props.options[index]
  if (!option || props.disabled) return
  emit('update:modelValue', option.value)
  buttons.value[index]?.focus()
}
const KEYS: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
}
const onKey = (event: KeyboardEvent, index: number): void => {
  const next = KEYS[event.key]
  if (!next) return
  event.preventDefault()
  select(next(index, props.options.length))
}
const focusChecked = (event: FocusEvent): void => {
  if (event.target === event.currentTarget) buttons.value[tabStop.value]?.focus()
}
</script>

<template>
  <div
    :id="id"
    role="radiogroup"
    tabindex="-1"
    :aria-label="label"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    :aria-disabled="disabled || undefined"
    class="grid w-full auto-cols-fr grid-flow-col gap-0.5 rounded-md border border-input bg-muted p-0.5 outline-none aria-invalid:border-destructive"
    @focus="focusChecked"
  >
    <button
      v-for="(option, index) in options"
      :key="option.value"
      ref="buttons"
      type="button"
      role="radio"
      :aria-checked="index === checkedIndex"
      :tabindex="index === tabStop ? 0 : -1"
      :disabled="disabled"
      class="h-8 min-w-0 truncate rounded-[6px] px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 ease-snap hover:text-foreground disabled:pointer-events-none disabled:opacity-60 aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-xs"
      @click="select(index)"
      @keydown="onKey($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
