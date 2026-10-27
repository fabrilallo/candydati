<script setup lang="ts">
import { fieldIdOf } from '@/lib/job-issues'
import type { FieldErrors, JobForm } from '@/lib/job-form'
import { withResponsibilities } from '@/lib/responsibility-suggestions'

const props = defineProps<{ form: JobForm; disabled: boolean; errors: FieldErrors }>()
const emit = defineEmits<{ patch: [changes: Partial<JobForm>] }>()
const { t } = useI18n()
const addResponsibilities = (lines: readonly string[]): void => emit('patch', { responsibilities: withResponsibilities(props.form.responsibilities, lines) })
</script>

<template>
  <JobSection id="job-description" :title="t('job.editor.sections.description')">
    <TextBlock id="job-field-summary" :label="t('job.editor.fields.summary')" :model-value="form.summary" :disabled="disabled" :error="errors.summary" @update:model-value="emit('patch', { summary: $event })" />
    <StringListField :id="fieldIdOf('responsibilities')" :label="t('job.editor.fields.responsibilities')" :hint="t('job.editor.hints.responsibilities')" :model-value="form.responsibilities" :disabled="disabled" :error="errors.responsibilities" @update:model-value="emit('patch', { responsibilities: $event })" />
    <ResponsibilitySuggestions :id="fieldIdOf('responsibilities')" :form="form" :disabled="disabled" @add="addResponsibilities" />
    <div class="grid items-start gap-6 @xl:grid-cols-2">
      <StringListField :id="fieldIdOf('requirements.mustHave')" :label="t('job.editor.fields.mustHave')" :hint="t('job.editor.hints.mustHave')" :model-value="form.mustHave" :disabled="disabled" :error="errors['requirements.mustHave']" @update:model-value="emit('patch', { mustHave: $event })" />
      <StringListField id="job-field-requirements-niceToHave" :label="t('job.editor.fields.niceToHave')" :hint="t('job.editor.hints.niceToHave')" :model-value="form.niceToHave" :disabled="disabled" :error="errors['requirements.niceToHave']" @update:model-value="emit('patch', { niceToHave: $event })" />
    </div>
    <StringListField id="job-field-technologies" :label="t('job.editor.fields.technologies')" :hint="t('job.editor.hints.technologies')" :model-value="form.technologies" :disabled="disabled" :error="errors.technologies" @update:model-value="emit('patch', { technologies: $event })" />
  </JobSection>
</template>
