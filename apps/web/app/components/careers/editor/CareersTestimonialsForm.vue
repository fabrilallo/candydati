<script setup lang="ts">
import { CAREERS_LIMITS, type SectionOf } from '@tt/domain'
import { moveItem, removeAt, replaceAt, type SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/** From one to six words of people who work here: quote, name, role and an optional photo. */
const props = defineProps<{ section: SectionOf<'testimonials'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'testimonials'>] }>()
const { t } = useI18n()
const id = (field: string) => `cp-${props.section.id}-${field}`
type Item = SectionOf<'testimonials'>['items'][number]

const items = (next: readonly Item[]): void => emit('patch', { items: [...next] })
const set = (index: number, patch: Partial<Item>): void => {
  const current = props.section.items[index]
  if (current) items(replaceAt(props.section.items, index, { ...current, ...patch }))
}
const setPhoto = (index: number, photoId: string | undefined): void => {
  const current = props.section.items[index]
  if (!current) return
  const { photoId: _previous, ...rest } = current
  items(replaceAt(props.section.items, index, photoId ? { ...rest, photoId } : rest))
}
</script>

<template>
  <div class="grid gap-5">
    <CareersLocalizedField :id="id('title')" :label="t('careersEditor.common.title')" :model-value="section.title" :max="CAREERS_LIMITS.title" :error="issues.title" testid="careers-field-title" @update:model-value="emit('patch', { title: $event })" />
    <CareersItemList
      :id="id('items')"
      :label="t('careersEditor.testimonials.items')"
      :items="section.items"
      :max="6"
      :add-label="t('careersEditor.testimonials.add')"
      :item-label="(index) => t('careersEditor.testimonials.item', { n: index + 1 })"
      :error="issues.items"
      testid="careers-testimonials"
      @add="items([...section.items, { quote: {}, name: '', role: {} }])"
      @move="(from, to) => items(moveItem(section.items, from, to))"
      @remove="(index) => items(removeAt(section.items, index))"
    >
      <template #default="{ item, index }">
        <CareersLocalizedField :id="id(`quote-${index}`)" :label="t('careersEditor.testimonials.quote')" :model-value="item.quote" :max="CAREERS_LIMITS.quote" multiline required :error="issues[`items.${index}.quote`]" :testid="`careers-field-testimonials-quote-${index}`" @update:model-value="set(index, { quote: $event })" />
        <CareersPlainField :id="id(`name-${index}`)" :label="t('careersEditor.testimonials.name')" :model-value="item.name" :max="CAREERS_LIMITS.personName" :error="issues[`items.${index}.name`]" :testid="`careers-field-testimonials-name-${index}`" @update:model-value="set(index, { name: $event })" />
        <CareersLocalizedField :id="id(`role-${index}`)" :label="t('careersEditor.testimonials.role')" :model-value="item.role" :max="CAREERS_LIMITS.personRole" :error="issues[`items.${index}.role`]" :testid="`careers-field-testimonials-role-${index}`" @update:model-value="set(index, { role: $event })" />
        <CareersMediaField :id="id(`photo-${index}`)" :label="t('careersEditor.testimonials.photo')" kind="image" :media-id="item.photoId" optional :error="issues[`items.${index}.photoId`]" :testid="`careers-media-pick-photo-${index}`" @pick="setPhoto(index, $event.id)" @clear="setPhoto(index, undefined)" />
      </template>
    </CareersItemList>
  </div>
</template>
