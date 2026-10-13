<script setup lang="ts">
import { SALARY_CURRENCIES, SALARY_PERIODS } from '@tt/domain'
import { currencySymbol } from '@/lib/ad-facts'
import { fieldIdOf } from '@/lib/job-issues'
import type { FieldErrors, JobForm } from '@/lib/job-form'

const props = defineProps<{ form: JobForm; disabled: boolean; errors: FieldErrors }>()
const emit = defineEmits<{ patch: [changes: Partial<JobForm>] }>()
const { t } = useI18n()

const currencyOptions = SALARY_CURRENCIES.map((value) => ({ value, label: value }))
const periodOptions = SALARY_PERIODS.map((value) => ({ value, label: t(`taxonomy.salaryPeriods.${value}`) }))
/** Amounts are written as the candidate will read them: separators and symbol of the ad's language. */
const symbol = computed(() => currencySymbol(props.form.currency, props.form.language))
</script>

<template>
  <JobSection id="job-salary" :title="t('job.editor.sections.salary')" :description="t('job.editor.hints.salary')">
    <div class="grid items-start gap-x-3 gap-y-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <FormField :id="fieldIdOf('salary.min')" :label="t('job.editor.fields.salaryMin')" :error="errors['salary.min']">
        <template #default="{ invalid, describedBy }">
          <AmountInput :id="fieldIdOf('salary.min')" :model-value="form.salaryMin" :language="form.language" :suffix="symbol" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { salaryMin: $event })" />
        </template>
      </FormField>
      <span class="hidden h-9 items-center self-start text-muted-foreground sm:mt-[1.375rem] sm:flex" aria-hidden="true">-</span>
      <FormField :id="fieldIdOf('salary.max')" :label="t('job.editor.fields.salaryMax')" :error="errors['salary.max']">
        <template #default="{ invalid, describedBy }">
          <AmountInput :id="fieldIdOf('salary.max')" :model-value="form.salaryMax" :language="form.language" :suffix="symbol" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { salaryMax: $event })" />
        </template>
      </FormField>
    </div>
    <div class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-x-3 gap-y-5">
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
