<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listKeyAction } from '@/lib/editor-inputs'
import { appendItem, insertItem, moveItem, removeItem, replaceItem } from '@/lib/job-form'

/** A list of short lines with fast entry: Enter adds the next item, Backspace on an empty one removes it. */
const props = defineProps<{
  id: string
  label: string
  hint?: string | undefined
  modelValue: readonly string[]
  disabled?: boolean
  /** Translation key of the problem with this list, if any. */
  error?: string | undefined
}>()
const emit = defineEmits<{ 'update:modelValue': [value: readonly string[]] }>()
const { t } = useI18n()

const describedBy = computed(() => (props.error ? `${props.id}-error` : props.hint ? `${props.id}-hint` : undefined))
const focusItem = async (index: number): Promise<void> => {
  await nextTick()
  document.getElementById(`${props.id}-${index}`)?.focus()
}
const add = async (): Promise<void> => {
  emit('update:modelValue', appendItem(props.modelValue, ''))
  await focusItem(props.modelValue.length)
}
const onKey = async (event: KeyboardEvent, index: number): Promise<void> => {
  const value = (event.target as HTMLInputElement).value
  const action = listKeyAction({ key: event.key, value, index, count: props.modelValue.length, composing: event.isComposing })
  if (!action) return
  event.preventDefault()
  if (action.kind === 'insert') {
    emit('update:modelValue', insertItem(props.modelValue, action.at, ''))
    await focusItem(action.at)
    return
  }
  emit('update:modelValue', removeItem(props.modelValue, action.index))
  if (action.focus !== null) await focusItem(action.focus)
  else document.getElementById(`${props.id}-add`)?.focus()
}
const move = async (index: number, delta: -1 | 1): Promise<void> => {
  emit('update:modelValue', moveItem(props.modelValue, index, delta))
  await focusItem(index + delta)
}
const itemLabel = (index: number): string => t('job.editor.list.item', { label: props.label, n: index + 1 })
</script>

<template>
  <fieldset :id="id" tabindex="-1" class="grid gap-2 outline-none" :aria-describedby="describedBy" :aria-invalid="Boolean(error) || undefined">
    <legend class="mb-1.5 text-sm leading-none font-medium">{{ label }}</legend>
    <p v-if="hint && !error" :id="`${id}-hint`" class="-mt-0.5 text-xs text-muted-foreground">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" role="alert" class="-mt-0.5 text-xs font-medium text-destructive">{{ t(error) }}</p>
    <ul v-if="modelValue.length" class="grid gap-1.5">
      <li v-for="(item, index) in modelValue" :key="index" class="group flex items-center gap-1.5" data-testid="list-item">
        <Input
          :id="`${id}-${index}`"
          :model-value="item"
          :disabled="disabled"
          :aria-label="itemLabel(index)"
          :placeholder="index === modelValue.length - 1 ? t('job.editor.list.placeholder') : undefined"
          enterkeyhint="next"
          @update:model-value="emit('update:modelValue', replaceItem(modelValue, index, String($event)))"
          @keydown="onKey($event, index)"
        />
        <ListItemButtons
          v-if="!disabled"
          class="opacity-100 transition-opacity duration-150 ease-snap group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
          :index="index"
          :count="modelValue.length"
          :remove-label="`${t('job.editor.list.remove')}: ${itemLabel(index)}`"
          :up-label="`${t('job.editor.list.moveUp')}: ${itemLabel(index)}`"
          :down-label="`${t('job.editor.list.moveDown')}: ${itemLabel(index)}`"
          @remove="emit('update:modelValue', removeItem(modelValue, index))"
          @move="(delta) => move(index, delta)"
        />
      </li>
    </ul>
    <div v-if="!disabled">
      <Button :id="`${id}-add`" type="button" variant="ghost" size="sm" class="-ml-2 text-muted-foreground hover:text-foreground" @click="add">
        <PlusIcon aria-hidden="true" />
        {{ t('job.editor.list.add') }}
      </Button>
    </div>
  </fieldset>
</template>
