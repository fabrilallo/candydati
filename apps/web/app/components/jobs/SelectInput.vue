<script setup lang="ts">
export interface SelectOption {
  readonly value: string
  readonly label: string
  /** Options sharing a group label are rendered inside one `optgroup`. */
  readonly group?: string
}

const props = defineProps<{
  id: string
  modelValue: string
  options: readonly SelectOption[]
  placeholder?: string | undefined
  disabled?: boolean
  invalid?: boolean
  describedBy?: string | undefined
}>()
defineEmits<{ 'update:modelValue': [value: string] }>()

const groups = computed(() => {
  const order = [...new Set(props.options.map((option) => option.group ?? ''))]
  return order.map((label) => ({ label, options: props.options.filter((option) => (option.group ?? '') === label) }))
})
</script>

<template>
  <select
    :id="id"
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    class="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-if="placeholder !== undefined" value="" class="bg-popover text-popover-foreground">{{ placeholder }}</option>
    <template v-for="group in groups" :key="group.label">
      <optgroup v-if="group.label !== ''" :label="group.label">
        <option v-for="option in group.options" :key="option.value" :value="option.value" :selected="option.value === modelValue" class="bg-popover text-popover-foreground">{{ option.label }}</option>
      </optgroup>
      <template v-else>
        <option v-for="option in group.options" :key="option.value" :value="option.value" :selected="option.value === modelValue" class="bg-popover text-popover-foreground">{{ option.label }}</option>
      </template>
    </template>
  </select>
</template>
