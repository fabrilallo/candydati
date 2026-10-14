<script setup lang="ts">
import { resolveText, type LocalizedText } from '@tt/domain'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { setText } from '@/lib/careers-editor'
import { issueKey } from '@/lib/careers-editor-issues'

/**
 * A text of the page in the editing language. When that language is empty, the text visitors would see instead (the
 * default language, or any language written) is the placeholder. Counter of the characters left; the issue in place.
 */
const props = defineProps<{
  id: string
  label: string
  modelValue: LocalizedText
  max: number
  multiline?: boolean
  required?: boolean
  hint?: string | undefined
  /** Issue code from the schema (`required`, `too_long`). */
  error?: string | undefined
  testid?: string | undefined
}>()
const emit = defineEmits<{ 'update:modelValue': [value: LocalizedText] }>()
const { t } = useI18n()
const editor = useCareersEditor()

const value = computed(() => props.modelValue[editor.value.locale] ?? '')
const placeholder = computed(() => (value.value === '' ? resolveText(props.modelValue, editor.value.locale, editor.value.fallback) : ''))
const describedBy = computed(() => [props.error ? `${props.id}-error` : props.hint ? `${props.id}-hint` : null, `${props.id}-count`].filter(Boolean).join(' '))
const update = (next: string | number): void => emit('update:modelValue', setText(props.modelValue, editor.value.locale, String(next)))
</script>

<template>
  <div class="grid gap-1.5">
    <div class="flex items-baseline justify-between gap-3">
      <Label :for="id">
        {{ label }}
        <span class="text-xs font-normal text-muted-foreground">{{ editor.locale.toUpperCase() }}</span>
        <span v-if="!required" class="text-xs font-normal text-muted-foreground">{{ t('careersEditor.field.optional') }}</span>
      </Label>
      <span :id="`${id}-count`" class="figure text-xs text-muted-foreground" :aria-label="t('careersEditor.field.count', { count: value.length, max })">{{ value.length }}/{{ max }}</span>
    </div>
    <Textarea
      v-if="multiline"
      :id="id"
      :model-value="value"
      :placeholder="placeholder"
      :maxlength="max"
      rows="4"
      :aria-invalid="Boolean(error) || undefined"
      :aria-describedby="describedBy"
      :data-testid="testid"
      @update:model-value="update"
    />
    <Input
      v-else
      :id="id"
      :model-value="value"
      :placeholder="placeholder"
      :maxlength="max"
      :aria-invalid="Boolean(error) || undefined"
      :aria-describedby="describedBy"
      :data-testid="testid"
      @update:model-value="update"
    />
    <p v-if="hint && !error" :id="`${id}-hint`" class="text-xs text-muted-foreground">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" role="alert" class="text-xs font-medium text-destructive">{{ t(issueKey(error)) }}</p>
  </div>
</template>
