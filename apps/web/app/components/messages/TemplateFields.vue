<script setup lang="ts">
import { EMAIL_TEMPLATE_BODY_MAX, EMAIL_TEMPLATE_SUBJECT_MAX } from '@tt/domain'
import { insertAtCursor } from '@/lib/template-text'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/**
 * Subject and body of a message or template, with the variable picker. A variable goes where the caret was in the
 * last field used (the body by default), replacing any selection, and the caret lands right after it.
 */
const props = defineProps<{ idPrefix: string; unknown: readonly string[]; disabled?: boolean; bodyRows?: number }>()
const subject = defineModel<string>('subject', { required: true })
const body = defineModel<string>('body', { required: true })
const { t } = useI18n()
const subjectId = computed(() => `${props.idPrefix}-subject`)
const bodyId = computed(() => `${props.idPrefix}-body`)
const unknownId = computed(() => `${props.idPrefix}-unknown`)
const lastField = ref<'subject' | 'body'>('body')

const insert = async (token: string): Promise<void> => {
  const field = lastField.value
  const element = document.getElementById(field === 'subject' ? subjectId.value : bodyId.value) as HTMLInputElement | HTMLTextAreaElement | null
  const model = field === 'subject' ? subject : body
  const next = insertAtCursor(model.value, element?.selectionStart ?? null, element?.selectionEnd ?? null, token)
  model.value = next.text
  await nextTick()
  element?.focus()
  element?.setSelectionRange(next.cursor, next.cursor)
}
</script>

<template>
  <div class="grid gap-4">
    <div class="grid gap-1.5">
      <Label :for="subjectId">{{ t('messages.composer.subject') }}</Label>
      <Input
        :id="subjectId"
        v-model="subject"
        :maxlength="EMAIL_TEMPLATE_SUBJECT_MAX"
        :disabled="disabled"
        :aria-describedby="unknown.length > 0 ? unknownId : undefined"
        data-testid="composer-subject"
        @focus="lastField = 'subject'"
      />
    </div>
    <div class="grid gap-1.5">
      <div class="flex items-end justify-between gap-2">
        <Label :for="bodyId">{{ t('messages.composer.body') }}</Label>
        <VariablePicker :disabled="disabled" @insert="insert" />
      </div>
      <Textarea
        :id="bodyId"
        v-model="body"
        :rows="bodyRows ?? 8"
        :maxlength="EMAIL_TEMPLATE_BODY_MAX"
        :disabled="disabled"
        class="min-h-40 resize-y"
        :aria-describedby="unknown.length > 0 ? unknownId : undefined"
        data-testid="composer-body"
        @focus="lastField = 'body'"
      />
    </div>
    <div v-if="unknown.length > 0" :id="unknownId" role="alert" class="grid gap-1.5 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive" data-testid="unknown-variables">
      <p class="font-medium">{{ t('messages.composer.unknownTitle', { count: unknown.length }, unknown.length) }}</p>
      <ul class="flex flex-wrap gap-1.5">
        <li v-for="name in unknown" :key="name"><code class="rounded bg-card px-1.5 py-0.5 font-mono text-xs">{{ name }}</code></li>
      </ul>
      <p class="text-xs">{{ t('messages.composer.unknownHint') }}</p>
    </div>
  </div>
</template>
