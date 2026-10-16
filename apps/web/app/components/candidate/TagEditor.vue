<script setup lang="ts">
import { PlusIcon, XIcon } from '@lucide/vue'
import { TAG_MAX } from '@candydati/domain'
import { addTag, removeTag } from '@/lib/candidate-view'

/** Tags as small pills, edited in place: Enter adds, the cross removes. Read-only without `candidate:update`. */
const props = defineProps<{ tags: readonly string[]; editable: boolean; busy: boolean }>()
const emit = defineEmits<{ save: [tags: readonly string[]] }>()
const { t } = useI18n()
const draft = ref('')
const adding = ref(false)
const input = ref<HTMLInputElement | null>(null)

const startAdding = async (): Promise<void> => {
  adding.value = true
  await nextTick()
  input.value?.focus()
}
const commit = (): void => {
  const next = addTag(props.tags, draft.value)
  draft.value = ''
  if (next !== props.tags) emit('save', next)
}
const onKey = (event: KeyboardEvent): void => {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    commit()
  } else if (event.key === 'Escape') {
    draft.value = ''
    adding.value = false
  }
}
const onBlur = (): void => {
  commit()
  adding.value = false
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5" data-testid="tag-editor">
    <span class="sr-only">{{ t('candidate.tags.label') }}</span>
    <span v-for="tag in tags" :key="tag" class="inline-flex h-6 items-center gap-1 rounded-full bg-secondary pr-1 pl-2.5 text-xs font-medium text-secondary-foreground" :class="editable ? '' : 'pr-2.5'" data-testid="tag">
      {{ tag }}
      <button
        v-if="editable"
        type="button"
        class="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-hidden"
        :aria-label="t('candidate.tags.remove', { tag })"
        :disabled="busy"
        @click="emit('save', removeTag(tags, tag))"
      >
        <XIcon class="size-3" aria-hidden="true" />
      </button>
    </span>
    <template v-if="editable">
      <input
        v-if="adding"
        ref="input"
        v-model="draft"
        :maxlength="TAG_MAX"
        :aria-label="t('candidate.tags.add')"
        :placeholder="t('candidate.tags.placeholder')"
        :disabled="busy"
        class="h-6 w-36 rounded-full border border-input bg-card px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
        data-testid="tag-input"
        @keydown="onKey"
        @blur="onBlur"
      />
      <button
        v-else
        type="button"
        class="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-input px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden"
        data-testid="tag-add"
        @click="startAdding"
      >
        <PlusIcon class="size-3" aria-hidden="true" />{{ t('candidate.tags.add') }}
      </button>
    </template>
    <span v-else-if="tags.length === 0" class="text-xs text-muted-foreground">{{ t('candidate.tags.none') }}</span>
  </div>
</template>
