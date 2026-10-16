<script setup lang="ts">
import { CAREERS_LIMITS, hasText, type CareersMediaAssetDto, type SectionOf } from '@candydati/domain'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/** An image beside a text. The description of the image is required: it is what a screen reader says. */
const props = defineProps<{ section: SectionOf<'image_text'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'image_text'>] }>()
const { t } = useI18n()
const id = (field: string) => `cp-${props.section.id}-${field}`
/** A new image brings its library description when the section has none yet. */
const pick = (asset: CareersMediaAssetDto): void => emit('patch', { imageId: asset.id, ...(hasText(props.section.alt) ? {} : { alt: asset.alt }) })
</script>

<template>
  <div class="grid gap-5">
    <CareersMediaField :id="id('image')" :label="t('careersEditor.common.image')" kind="image" :media-id="section.imageId || undefined" :error="issues.imageId" @pick="pick" />
    <CareersLocalizedField :id="id('alt')" :label="t('careersEditor.common.alt')" :model-value="section.alt" :max="CAREERS_LIMITS.alt" required :hint="t('careersEditor.common.altHint')" :error="issues.alt" testid="careers-field-alt" @update:model-value="emit('patch', { alt: $event })" />
    <div class="grid gap-1.5">
      <Label :for="id('side')">{{ t('careersEditor.imageText.side') }}</Label>
      <NativeSelect :id="id('side')" :model-value="section.imageSide" data-testid="careers-field-image-side" @update:model-value="emit('patch', { imageSide: $event === 'right' ? 'right' : 'left' })">
        <option value="left">{{ t('careersEditor.imageText.left') }}</option>
        <option value="right">{{ t('careersEditor.imageText.right') }}</option>
      </NativeSelect>
    </div>
    <CareersLocalizedField :id="id('title')" :label="t('careersEditor.common.title')" :model-value="section.title" :max="CAREERS_LIMITS.title" :error="issues.title" testid="careers-field-title" @update:model-value="emit('patch', { title: $event })" />
    <CareersLocalizedField :id="id('body')" :label="t('careersEditor.common.body')" :model-value="section.body" :max="CAREERS_LIMITS.sideBody" multiline required :hint="t('careersEditor.common.paragraphs')" :error="issues.body" testid="careers-field-body" @update:model-value="emit('patch', { body: $event })" />
  </div>
</template>
