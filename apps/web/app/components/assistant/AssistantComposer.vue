<script setup lang="ts">
import { ArrowUpIcon, SquareIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/** Where the person writes. Enter sends, Shift+Enter goes to a new line; while a turn streams, the button stops it. */
const props = defineProps<{ busy: boolean; disabled: boolean }>()
const emit = defineEmits<{ send: [text: string]; stop: [] }>()
const model = defineModel<string>({ required: true })
const { t } = useI18n()
const field = ref<HTMLTextAreaElement | null>(null)
const submit = (): void => {
  if (props.busy) emit('stop')
  else if (!props.disabled && model.value.trim() !== '') emit('send', model.value)
}
const onKey = (event: KeyboardEvent): void => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  if (!props.busy) submit()
}
defineExpose({ focus: () => field.value?.focus() })
</script>

<template>
  <form class="flex items-end gap-2 rounded-xl border bg-card p-1.5 pl-3 shadow-xs focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20" @submit.prevent="submit">
    <label for="assistant-input" class="sr-only">{{ t('assistant.input') }}</label>
    <textarea
      id="assistant-input"
      ref="field"
      v-model="model"
      rows="1"
      :disabled="disabled"
      :placeholder="t('assistant.placeholder')"
      class="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
      data-testid="assistant-input"
      @keydown="onKey"
    />
    <Button type="submit" size="icon-sm" :variant="busy ? 'outline' : 'default'" :disabled="!busy && (disabled || model.trim() === '')" :aria-label="busy ? t('assistant.stop') : t('assistant.send')" data-testid="assistant-send">
      <SquareIcon v-if="busy" class="size-3.5" aria-hidden="true" /><ArrowUpIcon v-else aria-hidden="true" />
    </Button>
  </form>
</template>
