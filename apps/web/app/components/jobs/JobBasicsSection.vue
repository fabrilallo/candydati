<script setup lang="ts">
import { CUSTOM_ROLE, CUSTOM_ROLE_MAX, CONTRACT_TYPES, SENIORITY_LEVELS, SUPPORTED_LOCALES } from '@candydati/domain'
import { Input } from '@/components/ui/input'
import { roleOptions as buildRoleOptions } from '@/lib/role-options'
import { fieldIdOf } from '@/lib/job-issues'
import type { FieldErrors, JobForm } from '@/lib/job-form'

defineProps<{ form: JobForm; disabled: boolean; errors: FieldErrors }>()
const emit = defineEmits<{ patch: [changes: Partial<JobForm>] }>()
const { t } = useI18n()

const roleOptions = buildRoleOptions(t)
const seniorityOptions = SENIORITY_LEVELS.map((value) => ({ value, label: t(`taxonomy.seniority.${value}`) }))
const contractOptions = CONTRACT_TYPES.map((value) => ({ value, label: t(`taxonomy.contractTypes.${value}`) }))
const languageOptions = SUPPORTED_LOCALES.map((value) => ({ value, label: t(`locales.${value}`) }))
</script>

<template>
  <JobSection id="job-basics" :title="t('job.editor.sections.basics')">
    <FormField :id="fieldIdOf('title')" :label="t('job.editor.fields.title')" :error="errors.title">
      <template #default="{ invalid, describedBy }">
        <Input
          :id="fieldIdOf('title')"
          :model-value="form.title"
          :disabled="disabled"
          maxlength="120"
          required
          class="h-11 text-base font-medium md:text-base"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
          @update:model-value="emit('patch', { title: String($event) })"
        />
      </template>
    </FormField>
    <div class="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
      <div class="sm:col-span-2">
        <FormField :id="fieldIdOf('role')" :label="t('job.editor.fields.role')" :error="errors.role">
          <template #default="{ invalid, describedBy }">
            <SelectInput :id="fieldIdOf('role')" :model-value="form.role" :options="roleOptions" :placeholder="t('job.editor.fields.rolePlaceholder')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { role: $event, customRole: $event === CUSTOM_ROLE ? form.customRole : '' })" />
          </template>
        </FormField>
      </div>
      <div v-if="form.role === CUSTOM_ROLE" class="sm:col-span-2">
        <FormField :id="fieldIdOf('customRole')" :label="t('job.editor.fields.customRole')" :hint="t('job.editor.fields.customRoleHint')" :error="errors.customRole">
          <template #default="{ invalid, describedBy }">
            <Input
              :id="fieldIdOf('customRole')"
              :model-value="form.customRole"
              :disabled="disabled"
              :maxlength="CUSTOM_ROLE_MAX"
              autocomplete="off"
              required
              :aria-invalid="invalid"
              :aria-describedby="describedBy"
              @update:model-value="emit('patch', { customRole: String($event) })"
            />
          </template>
        </FormField>
      </div>
      <FormField :id="fieldIdOf('seniority')" :label="t('job.editor.fields.seniority')" :error="errors.seniority">
        <template #default="{ invalid, describedBy }">
          <SelectInput :id="fieldIdOf('seniority')" :model-value="form.seniority" :options="seniorityOptions" :placeholder="t('job.editor.fields.choose')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { seniority: $event })" />
        </template>
      </FormField>
      <FormField :id="fieldIdOf('contractType')" :label="t('job.editor.fields.contractType')" :error="errors.contractType">
        <template #default="{ invalid, describedBy }">
          <SelectInput :id="fieldIdOf('contractType')" :model-value="form.contractType" :options="contractOptions" :placeholder="t('job.editor.fields.choose')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { contractType: $event })" />
        </template>
      </FormField>
      <FormField id="job-field-language" :label="t('job.editor.fields.language')" :error="errors.language">
        <template #default="{ invalid, describedBy }">
          <SelectInput id="job-field-language" :model-value="form.language" :options="languageOptions" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { language: $event })" />
        </template>
      </FormField>
    </div>
  </JobSection>
</template>
