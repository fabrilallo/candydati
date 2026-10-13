<script setup lang="ts">
import { SALARY_CURRENCIES, SALARY_PERIODS } from '@tt/domain'
import { Input } from '@/components/ui/input'
import { fieldIdOf } from '@/lib/job-issues'
import type { FieldErrors, JobForm } from '@/lib/job-form'

defineProps<{ form: JobForm; disabled: boolean; errors: FieldErrors }>()
const emit = defineEmits<{ patch: [changes: Partial<JobForm>] }>()
const { t } = useI18n()

const currencyOptions = SALARY_CURRENCIES.map((value) => ({ value, label: value }))
const periodOptions = SALARY_PERIODS.map((value) => ({ value, label: t(`taxonomy.salaryPeriods.${value}`) }))
</script>

<template>
  <JobSection id="job-salary" :title="t('job.editor.sections.salary')" :description="t('job.editor.hints.salary')">
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField :id="fieldIdOf('salary.min')" :label="t('job.editor.fields.salaryMin')" :error="errors['salary.min']">
        <template #default="{ invalid, describedBy }">
          <Input :id="fieldIdOf('salary.min')" type="number" inputmode="numeric" min="1" step="1" :model-value="form.salaryMin" :disabled="disabled" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('patch', { salaryMin: String($event) })" />
        </template>
      </FormField>
      <FormField :id="fieldIdOf('salary.max')" :label="t('job.editor.fields.salaryMax')" :error="errors['salary.max']">
        <template #default="{ invalid, describedBy }">
          <Input :id="fieldIdOf('salary.max')" type="number" inputmode="numeric" min="1" step="1" :model-value="form.salaryMax" :disabled="disabled" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('patch', { salaryMax: String($event) })" />
        </template>
      </FormField>
      <FormField id="job-field-currency" :label="t('job.editor.fields.currency')" :error="errors['salary.currency']">
        <template #default="{ invalid, describedBy }">
          <SelectInput id="job-field-currency" :model-value="form.currency" :options="currencyOptions" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { currency: $event })" />
        </template>
      </FormField>
      <FormField id="job-field-period" :label="t('job.editor.fields.period')" :error="errors['salary.period']">
        <template #default="{ invalid, describedBy }">
          <SelectInput id="job-field-period" :model-value="form.period" :options="periodOptions" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { period: $event })" />
        </template>
      </FormField>
    </div>
  </JobSection>
</template>
