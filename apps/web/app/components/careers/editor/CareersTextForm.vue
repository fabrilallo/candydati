<script setup lang="ts">
import { CAREERS_LIMITS, type SectionOf } from '@candydati/domain'
import type { SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/** A block of text with an optional title. */
const props = defineProps<{ section: SectionOf<'text'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'text'>] }>()
const { t } = useI18n()
const id = (field: string) => `cp-${props.section.id}-${field}`
</script>

<template>
  <div class="grid gap-5">
    <CareersLocalizedField :id="id('title')" :label="t('careersEditor.common.title')" :model-value="section.title" :max="CAREERS_LIMITS.title" :error="issues.title" testid="careers-field-title" @update:model-value="emit('patch', { title: $event })" />
    <CareersLocalizedField :id="id('body')" :label="t('careersEditor.common.body')" :model-value="section.body" :max="CAREERS_LIMITS.body" multiline required :hint="t('careersEditor.common.paragraphs')" :error="issues.body" testid="careers-field-body" @update:model-value="emit('patch', { body: $event })" />
  </div>
</template>
