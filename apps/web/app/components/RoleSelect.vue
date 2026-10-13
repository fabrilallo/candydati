<script setup lang="ts">
import type { Role } from '@tt/domain'

defineProps<{ id: string; modelValue: string; roles: readonly Role[]; disabled?: boolean; invalid?: boolean; describedBy?: string | undefined }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()
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
    <option v-for="role in roles" :key="role" :value="role" :selected="role === modelValue" class="bg-popover text-popover-foreground">{{ t(`roles.${role}`) }}</option>
  </select>
</template>
