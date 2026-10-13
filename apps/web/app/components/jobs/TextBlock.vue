<script setup lang="ts">
import { Textarea } from '@/components/ui/textarea'

defineProps<{ id: string; label: string; hint?: string | undefined; modelValue: string; disabled: boolean; error?: string | undefined }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <FormField :id="id" :label="label" :hint="hint" :error="error">
    <template #default="{ invalid, describedBy }">
      <Textarea :id="id" :model-value="modelValue" :disabled="disabled" maxlength="4000" rows="3" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="$emit('update:modelValue', String($event))" />
    </template>
  </FormField>
</template>
