<script setup lang="ts">
import type { CareersSection, SectionType } from '@candydati/domain'
import type { Component } from 'vue'
import type { SectionPatch } from '@/lib/careers-editor'
import { issueKey, type FieldIssues } from '@/lib/careers-editor-issues'
import CareersGalleryForm from './CareersGalleryForm.vue'
import CareersHeroForm from './CareersHeroForm.vue'
import CareersImageTextForm from './CareersImageTextForm.vue'
import CareersJobsForm from './CareersJobsForm.vue'
import CareersLinksForm from './CareersLinksForm.vue'
import CareersNumbersForm from './CareersNumbersForm.vue'
import CareersTestimonialsForm from './CareersTestimonialsForm.vue'
import CareersTextForm from './CareersTextForm.vue'
import CareersValuesForm from './CareersValuesForm.vue'
import CareersVideoForm from './CareersVideoForm.vue'

/** The form of the selected section, one component per type, with the section's own issue on top. */
defineProps<{ section: CareersSection; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch] }>()
const { t } = useI18n()

const FORMS: Readonly<Record<SectionType, Component>> = {
  hero: CareersHeroForm,
  text: CareersTextForm,
  image_text: CareersImageTextForm,
  gallery: CareersGalleryForm,
  video: CareersVideoForm,
  values: CareersValuesForm,
  numbers: CareersNumbersForm,
  testimonials: CareersTestimonialsForm,
  jobs: CareersJobsForm,
  links: CareersLinksForm,
}
</script>

<template>
  <section class="grid gap-5 rounded-xl panel px-5 py-5 sm:px-6" :aria-labelledby="`cp-form-${section.id}`" data-testid="careers-section-form" :data-section-type="section.type">
    <header class="grid gap-1">
      <h2 :id="`cp-form-${section.id}`" class="text-base font-semibold tracking-tight">{{ t(`careersEditor.types.${section.type}.name`) }}</h2>
      <p class="text-sm text-muted-foreground">{{ t(`careersEditor.types.${section.type}.description`) }}</p>
    </header>
    <FormAlert :message-key="issues[''] ? issueKey(issues['']) : null" />
    <component :is="FORMS[section.type]" :key="section.id" :section="section" :issues="issues" @patch="emit('patch', $event)" />
  </section>
</template>
