<script setup lang="ts">
import type { SectionType } from '@candydati/domain'
import { addableTypes, canAddSection, canMoveTo, sectionTitle, type EditorDocument } from '@/lib/careers-editor'
import type { EditorIssues } from '@/lib/careers-editor-issues'

/**
 * The sections of the page, in order. Move with the arrow buttons (keyboard) or by dragging the grip (pointer); each
 * move is announced. The hero, when there is one, stays first; the open positions can be hidden but not deleted.
 */
const props = defineProps<{ document: EditorDocument; selectedId: string | null; issues: EditorIssues }>()
const emit = defineEmits<{ select: [id: string]; move: [id: string, to: number]; toggle: [id: string]; remove: [id: string]; add: [type: SectionType] }>()
const { t } = useI18n()
const editor = useCareersEditor()

const list = ref<HTMLElement | null>(null)
const announcement = ref('')
const pendingDelete = ref<string | null>(null)

const sections = computed(() => props.document.sections)
const nameOf = (id: string): string => {
  const section = sections.value.find((candidate) => candidate.id === id)
  if (!section) return ''
  return sectionTitle(section, editor.value.locale, editor.value.fallback) ?? t(`careersEditor.types.${section.type}.name`)
}
const issueCount = (id: string): number => Object.keys(props.issues.sections[id] ?? {}).length

const moveTo = async (id: string, to: number, focus: 'up' | 'down' | null): Promise<void> => {
  emit('move', id, to)
  announcement.value = t('careersEditor.sections.moved', { position: to + 1, total: sections.value.length })
  if (!focus) return
  await nextTick()
  const preferred = document.getElementById(`cp-${focus}-${id}`) as HTMLButtonElement | null
  ;(preferred && !preferred.disabled ? preferred : document.getElementById(`cp-row-${id}`))?.focus()
}
const drag = useSectionPointerDrag(list, (from, to) => {
  const section = sections.value[from]
  if (section && canMoveTo(props.document, from, to)) void moveTo(section.id, to, null)
})

const confirmDelete = (): void => {
  if (pendingDelete.value) emit('remove', pendingDelete.value)
  pendingDelete.value = null
}
const pendingName = computed(() => (pendingDelete.value ? nameOf(pendingDelete.value) : ''))
</script>

<template>
  <section class="grid grid-cols-[minmax(0,1fr)] gap-3" aria-labelledby="cp-sections-title" data-testid="careers-sections">
    <div class="flex items-center justify-between gap-3">
      <h2 id="cp-sections-title" class="text-base font-semibold tracking-tight">{{ t('careersEditor.sections.title') }}</h2>
      <CareersAddSection :types="addableTypes(document)" :disabled="!canAddSection(document)" @add="emit('add', $event)" />
    </div>
    <ol ref="list" class="grid grid-cols-[minmax(0,1fr)] gap-1.5" :class="drag.dragging.value !== null ? 'cursor-grabbing select-none' : ''" @pointermove="drag.move" @pointerup="drag.end" @pointercancel="drag.cancel">
      <template v-for="(section, index) in sections" :key="section.id">
        <li v-if="drag.slot.value === index && drag.dragging.value !== index" class="h-0.5 rounded-full bg-primary" aria-hidden="true" data-testid="careers-drop-line" />
        <CareersSectionRow
          :section="section"
          :name="nameOf(section.id)"
          :selected="section.id === selectedId"
          :can-up="canMoveTo(document, index, index - 1)"
          :can-down="canMoveTo(document, index, index + 1)"
          :draggable="section.type !== 'hero'"
          :dragging="drag.dragging.value === index"
          :issue-count="issueCount(section.id)"
          @select="emit('select', section.id)"
          @up="moveTo(section.id, index - 1, 'up')"
          @down="moveTo(section.id, index + 1, 'down')"
          @toggle="emit('toggle', section.id)"
          @remove="pendingDelete = section.id"
          @grab="drag.start($event, index)"
        />
      </template>
      <li v-if="drag.slot.value === sections.length" class="h-0.5 rounded-full bg-primary" aria-hidden="true" />
    </ol>
    <p class="sr-only" aria-live="polite" data-testid="careers-sections-live">{{ announcement }}</p>
    <ConfirmDialog
      :open="pendingDelete !== null"
      :title="t('careersEditor.sections.deleteTitle', { name: pendingName })"
      :body="t('careersEditor.sections.deleteBody')"
      :confirm-label="t('careersEditor.sections.deleteConfirm')"
      destructive
      @update:open="(open) => { if (!open) pendingDelete = null }"
      @confirm="confirmDelete"
    />
  </section>
</template>
