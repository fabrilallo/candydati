<script setup lang="ts">
import { CAREERS_LIMITS, type SectionOf } from '@candydati/domain'
import { moveItem, removeAt, replaceAt, type SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/** From two to four figures, each a short value and its label. Only real figures: nothing is suggested. */
const props = defineProps<{ section: SectionOf<'numbers'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'numbers'>] }>()
const { t } = useI18n()
const id = (field: string) => `cp-${props.section.id}-${field}`
type Item = SectionOf<'numbers'>['items'][number]

const items = (next: readonly Item[]): void => emit('patch', { items: [...next] })
const set = (index: number, patch: Partial<Item>): void => {
  const current = props.section.items[index]
  if (current) items(replaceAt(props.section.items, index, { ...current, ...patch }))
}
</script>

<template>
  <div class="grid gap-5">
    <CareersLocalizedField :id="id('title')" :label="t('careersEditor.common.title')" :model-value="section.title" :max="CAREERS_LIMITS.title" :error="issues.title" testid="careers-field-title" @update:model-value="emit('patch', { title: $event })" />
    <CareersItemList
      :id="id('items')"
      :label="t('careersEditor.numbers.items')"
      :items="section.items"
      :max="4"
      :add-label="t('careersEditor.numbers.add')"
      :item-label="(index) => t('careersEditor.numbers.item', { n: index + 1 })"
      :error="issues.items"
      testid="careers-numbers"
      @add="items([...section.items, { value: '', label: {} }])"
      @move="(from, to) => items(moveItem(section.items, from, to))"
      @remove="(index) => items(removeAt(section.items, index))"
    >
      <template #default="{ item, index }">
        <CareersPlainField :id="id(`value-${index}`)" :label="t('careersEditor.numbers.value')" :model-value="item.value" :max="CAREERS_LIMITS.numberValue" :hint="t('careersEditor.numbers.valueHint')" :error="issues[`items.${index}.value`]" :testid="`careers-field-numbers-value-${index}`" @update:model-value="set(index, { value: $event })" />
        <CareersLocalizedField :id="id(`label-${index}`)" :label="t('careersEditor.numbers.label')" :model-value="item.label" :max="CAREERS_LIMITS.numberLabel" required :error="issues[`items.${index}.label`]" :testid="`careers-field-numbers-label-${index}`" @update:model-value="set(index, { label: $event })" />
      </template>
    </CareersItemList>
  </div>
</template>
