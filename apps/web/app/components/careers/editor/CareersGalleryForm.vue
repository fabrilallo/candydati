<script setup lang="ts">
import { CAREERS_LIMITS, type CareersMediaAssetDto, type SectionOf } from '@tt/domain'
import { moveItem, removeAt, replaceAt, type SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/** From two to nine images, each with its own description. */
const props = defineProps<{ section: SectionOf<'gallery'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'gallery'>] }>()
const { t } = useI18n()
const editor = useCareersEditor()
const id = (field: string) => `cp-${props.section.id}-${field}`
type Item = SectionOf<'gallery'>['images'][number]

const images = (next: readonly Item[]): void => emit('patch', { images: [...next] })
const add = (): void => editor.value.pick('image', (asset) => images([...props.section.images, { imageId: asset.id, alt: asset.alt }]))
const replace = (index: number, asset: CareersMediaAssetDto): void => {
  const current = props.section.images[index]
  if (current) images(replaceAt(props.section.images, index, { imageId: asset.id, alt: Object.keys(current.alt).length > 0 ? current.alt : asset.alt }))
}
</script>

<template>
  <div class="grid gap-5">
    <CareersLocalizedField :id="id('title')" :label="t('careersEditor.common.title')" :model-value="section.title" :max="CAREERS_LIMITS.title" :error="issues.title" testid="careers-field-title" @update:model-value="emit('patch', { title: $event })" />
    <CareersItemList
      :id="id('images')"
      :label="t('careersEditor.gallery.images')"
      :items="section.images"
      :max="9"
      :add-label="t('careersEditor.gallery.add')"
      :item-label="(index) => t('careersEditor.gallery.item', { n: index + 1 })"
      :error="issues.images"
      testid="careers-gallery"
      @add="add"
      @move="(from, to) => images(moveItem(section.images, from, to))"
      @remove="(index) => images(removeAt(section.images, index))"
    >
      <template #default="{ item, index }">
        <CareersMediaField :id="id(`image-${index}`)" :label="t('careersEditor.common.image')" kind="image" :media-id="item.imageId || undefined" :error="issues[`images.${index}.imageId`]" :testid="`careers-media-pick-gallery-${index}`" @pick="replace(index, $event)" />
        <CareersLocalizedField :id="id(`alt-${index}`)" :label="t('careersEditor.common.alt')" :model-value="item.alt" :max="CAREERS_LIMITS.alt" required :error="issues[`images.${index}.alt`]" :testid="`careers-field-gallery-alt-${index}`" @update:model-value="images(replaceAt(section.images, index, { ...item, alt: $event }))" />
      </template>
    </CareersItemList>
  </div>
</template>
