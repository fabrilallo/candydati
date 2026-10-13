<script setup lang="ts">
import { WORK_MODES } from '@tt/domain'
import { Input } from '@/components/ui/input'
import { countryOptions } from '@/lib/countries'
import { fieldIdOf } from '@/lib/job-issues'
import type { FieldErrors, JobForm } from '@/lib/job-form'

const props = defineProps<{ form: JobForm; disabled: boolean; errors: FieldErrors }>()
const emit = defineEmits<{ patch: [changes: Partial<JobForm>] }>()
const { t, locale } = useI18n()

const modeOptions = WORK_MODES.map((value) => ({ value, label: t(`taxonomy.workModes.${value}`) }))
const countries = computed(() => countryOptions(locale.value, props.form.country).map((option) => ({ value: option.code, label: option.name })))
const needsPlace = computed(() => props.form.workMode === 'hybrid' || props.form.workMode === 'onsite')
</script>

<template>
  <JobSection id="job-work" :title="t('job.editor.sections.work')">
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField :id="fieldIdOf('workMode')" :label="t('job.editor.fields.workMode')" :error="errors.workMode">
        <template #default="{ invalid, describedBy }">
          <SelectInput :id="fieldIdOf('workMode')" :model-value="form.workMode" :options="modeOptions" :placeholder="t('job.editor.fields.choose')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { workMode: $event })" />
        </template>
      </FormField>
      <FormField :id="fieldIdOf('location.country')" :label="t('job.editor.fields.country')" :error="errors['location.country']">
        <template #default="{ invalid, describedBy }">
          <SelectInput :id="fieldIdOf('location.country')" :model-value="form.country" :options="countries" :placeholder="t('job.editor.fields.choose')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { country: $event })" />
        </template>
      </FormField>
      <template v-if="needsPlace">
        <FormField :id="fieldIdOf('location.city')" :label="t('job.editor.fields.city')" :error="errors['location.city']">
          <template #default="{ invalid, describedBy }">
            <Input :id="fieldIdOf('location.city')" :model-value="form.city" :disabled="disabled" maxlength="120" autocomplete="off" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('patch', { city: String($event) })" />
          </template>
        </FormField>
        <FormField :id="fieldIdOf('location.onsiteDaysPerWeek')" :label="t('job.editor.fields.onsiteDaysPerWeek')" :error="errors['location.onsiteDaysPerWeek']">
          <template #default="{ invalid, describedBy }">
            <Input :id="fieldIdOf('location.onsiteDaysPerWeek')" type="number" inputmode="numeric" min="1" max="7" step="1" :model-value="form.onsiteDaysPerWeek" :disabled="disabled" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('patch', { onsiteDaysPerWeek: String($event) })" />
          </template>
        </FormField>
      </template>
    </div>
  </JobSection>
</template>
