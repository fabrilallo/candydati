<script setup lang="ts">
import { InfoIcon } from '@lucide/vue'
import { CAREERS_LIMITS, type SectionOf } from '@candydati/domain'
import type { SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/** The open positions: the list is automatic (published ads); only its title and an introduction are written here. */
const props = defineProps<{ section: SectionOf<'jobs'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'jobs'>] }>()
const { t } = useI18n()
const id = (field: string) => `cp-${props.section.id}-${field}`
</script>

<template>
  <div class="grid gap-5">
    <p class="flex items-start gap-2 rounded-lg border bg-muted px-3.5 py-2.5 text-sm text-muted-foreground" data-testid="careers-jobs-note">
      <InfoIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('careersEditor.jobs.note') }}
    </p>
    <CareersLocalizedField :id="id('title')" :label="t('careersEditor.common.title')" :model-value="section.title" :max="CAREERS_LIMITS.title" :hint="t('careersEditor.jobs.titleHint', { title: t('careersSite.jobs.title') })" :error="issues.title" testid="careers-field-title" @update:model-value="emit('patch', { title: $event })" />
    <CareersLocalizedField :id="id('intro')" :label="t('careersEditor.jobs.intro')" :model-value="section.intro" :max="CAREERS_LIMITS.jobsIntro" multiline :error="issues.intro" testid="careers-field-intro" @update:model-value="emit('patch', { intro: $event })" />
  </div>
</template>
