<script setup lang="ts">
import { CAREERS_LIMITS, VALUE_ICONS, type SectionOf } from '@candydati/domain'
import { moveItem, removeAt, replaceAt, type SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/** From three to eight values or perks, each with an icon, a title and an optional line of text. */
const props = defineProps<{ section: SectionOf<'values'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'values'>] }>()
const { t } = useI18n()
const id = (field: string) => `cp-${props.section.id}-${field}`
type Item = SectionOf<'values'>['items'][number]

const items = (next: readonly Item[]): void => emit('patch', { items: [...next] })
const set = (index: number, patch: Partial<Item>): void => {
  const current = props.section.items[index]
  if (current) items(replaceAt(props.section.items, index, { ...current, ...patch }))
}
const add = (): void => {
  const used = new Set(props.section.items.map((item) => item.icon))
  items([...props.section.items, { icon: VALUE_ICONS.find((icon) => !used.has(icon)) ?? 'heart', title: {}, text: {} }])
}
</script>

<template>
  <div class="grid gap-5">
    <CareersLocalizedField :id="id('title')" :label="t('careersEditor.common.title')" :model-value="section.title" :max="CAREERS_LIMITS.title" :error="issues.title" testid="careers-field-title" @update:model-value="emit('patch', { title: $event })" />
    <CareersItemList
      :id="id('items')"
      :label="t('careersEditor.values.items')"
      :items="section.items"
      :max="8"
      :add-label="t('careersEditor.values.add')"
      :item-label="(index) => t('careersEditor.values.item', { n: index + 1 })"
      :error="issues.items"
      testid="careers-values"
      @add="add"
      @move="(from, to) => items(moveItem(section.items, from, to))"
      @remove="(index) => items(removeAt(section.items, index))"
    >
      <template #default="{ item, index }">
        <CareersIconPicker :id="id(`icon-${index}`)" :model-value="item.icon" :testid="`careers-field-values-icon-${index}`" @update:model-value="set(index, { icon: $event })" />
        <CareersLocalizedField :id="id(`title-${index}`)" :label="t('careersEditor.values.itemTitle')" :model-value="item.title" :max="CAREERS_LIMITS.valueTitle" required :error="issues[`items.${index}.title`]" :testid="`careers-field-values-title-${index}`" @update:model-value="set(index, { title: $event })" />
        <CareersLocalizedField :id="id(`text-${index}`)" :label="t('careersEditor.values.itemText')" :model-value="item.text" :max="CAREERS_LIMITS.valueText" multiline :error="issues[`items.${index}.text`]" :testid="`careers-field-values-text-${index}`" @update:model-value="set(index, { text: $event })" />
      </template>
    </CareersItemList>
  </div>
</template>
