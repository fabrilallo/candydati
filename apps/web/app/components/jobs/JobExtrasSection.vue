<script setup lang="ts">
import type { FieldErrors, JobForm } from '@/lib/job-form'

defineProps<{ form: JobForm; disabled: boolean; errors: FieldErrors }>()
const emit = defineEmits<{ patch: [changes: Partial<JobForm>] }>()
const { t } = useI18n()
</script>

<template>
  <JobSection id="job-extras" :title="t('job.editor.sections.extras')">
    <StringListField id="job-field-benefits" :label="t('job.editor.fields.benefits')" :hint="t('job.editor.hints.benefits')" :model-value="form.benefits" :disabled="disabled" :error="errors.benefits" @update:model-value="emit('patch', { benefits: $event })" />
    <TextBlock id="job-field-growth" :label="t('job.editor.fields.growth')" :hint="t('job.editor.hints.growth')" :model-value="form.growth" :disabled="disabled" :error="errors.growth" @update:model-value="emit('patch', { growth: $event })" />
    <TextBlock id="job-field-workLifeBalance" :label="t('job.editor.fields.workLifeBalance')" :hint="t('job.editor.hints.workLifeBalance')" :model-value="form.workLifeBalance" :disabled="disabled" :error="errors.workLifeBalance" @update:model-value="emit('patch', { workLifeBalance: $event })" />
    <TextBlock id="job-field-culture" :label="t('job.editor.fields.culture')" :hint="t('job.editor.hints.culture')" :model-value="form.culture" :disabled="disabled" :error="errors.culture" @update:model-value="emit('patch', { culture: $event })" />
  </JobSection>
</template>
