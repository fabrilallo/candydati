<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { appendItem, moveItem, removeItem, replaceItem } from '@/lib/job-form'

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
const add = async (): Promise<void> => {
  emit('update:modelValue', appendItem(props.modelValue, ''))
  await nextTick()
  document.getElementById(`${props.id}-${props.modelValue.length}`)?.focus()
}
const itemLabel = (index: number): string => t('job.editor.list.item', { label: props.label, n: index + 1 })
</script>

<template>
  <fieldset :id="id" tabindex="-1" class="grid gap-2 outline-none" :aria-describedby="describedBy" :aria-invalid="Boolean(error) || undefined">
    <legend class="text-sm font-medium leading-none">{{ label }}</legend>
    <p v-if="hint && !error" :id="`${id}-hint`" class="text-xs text-muted-foreground">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" role="alert" class="text-xs font-medium text-destructive">{{ t(error) }}</p>
    <ul v-if="modelValue.length" class="grid gap-2">
      <li v-for="(item, index) in modelValue" :key="index" class="flex items-center gap-2" data-testid="list-item">
        <Input
          :id="`${id}-${index}`"
          :model-value="item"
          :disabled="disabled"
          :aria-label="itemLabel(index)"
          @update:model-value="emit('update:modelValue', replaceItem(modelValue, index, String($event)))"
        />
        <ListItemButtons
          v-if="!disabled"
          :index="index"
          :count="modelValue.length"
          :remove-label="`${t('job.editor.list.remove')}: ${itemLabel(index)}`"
          :up-label="`${t('job.editor.list.moveUp')}: ${itemLabel(index)}`"
          :down-label="`${t('job.editor.list.moveDown')}: ${itemLabel(index)}`"
          @remove="emit('update:modelValue', removeItem(modelValue, index))"
          @move="(delta) => emit('update:modelValue', moveItem(modelValue, index, delta))"
        />
      </li>
    </ul>
    <div v-if="!disabled">
      <Button type="button" variant="outline" size="sm" @click="add">
        <PlusIcon aria-hidden="true" />
        {{ t('job.editor.list.add') }}
      </Button>
    </div>
  </fieldset>
</template>
