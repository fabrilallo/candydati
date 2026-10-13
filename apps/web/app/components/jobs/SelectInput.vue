<script setup lang="ts">
import { NativeSelect } from '@/components/ui/native-select'

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
  <NativeSelect
    :id="id"
    :model-value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
    <template v-for="group in groups" :key="group.label">
      <optgroup v-if="group.label !== ''" :label="group.label">
        <option v-for="option in group.options" :key="option.value" :value="option.value" :selected="option.value === modelValue">{{ option.label }}</option>
      </optgroup>
      <template v-else>
        <option v-for="option in group.options" :key="option.value" :value="option.value" :selected="option.value === modelValue">{{ option.label }}</option>
      </template>
    </template>
  </NativeSelect>
</template>
