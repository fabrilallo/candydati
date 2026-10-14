<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { issueKey } from '@/lib/careers-editor-issues'

/** A text that is the same in every language (a figure, a name, an address), with its counter and issue in place. */
const props = defineProps<{
  id: string
  label: string
  modelValue: string
  max: number
  type?: string
  inputmode?: 'text' | 'url' | 'numeric'
  placeholder?: string | undefined
  hint?: string | undefined
  /** Issue code, or a full translation key when it contains a dot. */
  error?: string | undefined
  testid?: string | undefined
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()
const errorText = computed(() => (props.error ? t(props.error.includes('.') ? props.error : issueKey(props.error)) : ''))
const describedBy = computed(() => (props.error ? `${props.id}-error` : props.hint ? `${props.id}-hint` : undefined))
</script>

<template>
  <div class="grid gap-1.5">
    <div class="flex items-baseline justify-between gap-3">
      <Label :for="id">{{ label }}</Label>
      <span class="figure text-xs text-muted-foreground" aria-hidden="true">{{ modelValue.length }}/{{ max }}</span>
    </div>
    <Input
      :id="id"
      :model-value="modelValue"
      :type="type ?? 'text'"
      :inputmode="inputmode"
      :placeholder="placeholder"
      :maxlength="max"
      :aria-invalid="Boolean(error) || undefined"
      :aria-describedby="describedBy"
      :data-testid="testid"
      @update:model-value="emit('update:modelValue', String($event))"
    />
    <p v-if="hint && !error" :id="`${id}-hint`" class="text-xs text-muted-foreground">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" role="alert" class="text-xs font-medium text-destructive">{{ errorText }}</p>
  </div>
</template>
