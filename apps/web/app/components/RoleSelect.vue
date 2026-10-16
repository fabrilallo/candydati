<script setup lang="ts">
import type { Role } from '@candydati/domain'
import { NativeSelect } from '@/components/ui/native-select'

defineProps<{ id: string; modelValue: string; roles: readonly Role[]; disabled?: boolean; invalid?: boolean; describedBy?: string | undefined }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()
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
    <option v-for="role in roles" :key="role" :value="role" :selected="role === modelValue">{{ t(`roles.${role}`) }}</option>
  </NativeSelect>
</template>
