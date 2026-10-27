<script setup lang="ts">
import { CUSTOM_ROLE, CUSTOM_ROLE_MAX, WORK_MODES } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { createJobRequest } from '@/lib/job-request-api'
import { requestFormFromTitle, requestLanguage, toRequestInput, validateRequestForm, type JobRequestForm, type RequestFormErrors } from '@/lib/job-request-form'
import { roleOptions as buildRoleOptions } from '@/lib/role-options'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

/** A hiring manager asks for a position. The title can come prefilled (`?title=` from the job editor). */
const props = defineProps<{ title?: string | undefined }>()
const { t, locale } = useI18n()
const request = useJobsApi()
const form = ref<JobRequestForm>(requestFormFromTitle(props.title))
const errors = ref<RequestFormErrors>({})
const pending = ref(false)
const errorKey = ref<string | null>(null)

const patch = (changes: Partial<JobRequestForm>): void => {
  form.value = { ...form.value, ...changes }
  errors.value = Object.fromEntries(Object.entries(errors.value).filter(([key]) => !(key in changes)))
}
const roleOptions = buildRoleOptions(t)
const modeOptions = WORK_MODES.map((value) => ({ value, label: t(`taxonomy.workModes.${value}`) }))

const submit = async (): Promise<void> => {
  errors.value = validateRequestForm(form.value)
  if (Object.keys(errors.value).length > 0) return
  pending.value = true
  errorKey.value = null
  try {
    const created = await createJobRequest(request, toRequestInput(form.value, requestLanguage(locale.value)))
    toast.success(t('jobRequests.form.sent'))
    await navigateTo(`/app/job-requests/${encodeURIComponent(created.id)}`)
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    pending.value = false
  }
}
const text = (value: string | number): string => String(value)
</script>

<template>
  <form class="grid max-w-3xl gap-6" novalidate data-testid="request-form" @submit.prevent="submit">
    <div class="grid gap-5 rounded-xl panel px-5 py-5 sm:px-6">
      <FormField id="req-title" :label="t('jobRequests.fields.title')" :hint="t('jobRequests.fields.titleHint')" :error="errors.title">
        <template #default="{ invalid, describedBy }">
          <Input id="req-title" :model-value="form.title" maxlength="120" autocomplete="off" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="req-title" @update:model-value="patch({ title: text($event) })" />
        </template>
      </FormField>
      <FormField id="req-role" :label="t('jobRequests.fields.role')" :error="errors.role">
        <template #default="{ invalid, describedBy }">
          <SelectInput id="req-role" :model-value="form.role" :options="roleOptions" :placeholder="t('jobRequests.fields.choose')" :invalid="invalid" :described-by="describedBy" @update:model-value="patch({ role: $event, customRole: $event === CUSTOM_ROLE ? form.customRole : '' })" />
        </template>
      </FormField>
      <FormField v-if="form.role === CUSTOM_ROLE" id="req-custom-role" :label="t('jobRequests.fields.customRole')" :error="errors.customRole">
        <template #default="{ invalid, describedBy }">
          <Input id="req-custom-role" :model-value="form.customRole" :maxlength="CUSTOM_ROLE_MAX" autocomplete="off" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="req-custom-role" @update:model-value="patch({ customRole: text($event) })" />
        </template>
      </FormField>
      <FormField id="req-reason" :label="t('jobRequests.fields.reason')" :hint="t('jobRequests.fields.reasonHint')" :error="errors.reason">
        <template #default="{ invalid, describedBy }">
          <Textarea id="req-reason" :model-value="form.reason" maxlength="4000" rows="3" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="req-reason" @update:model-value="patch({ reason: text($event) })" />
        </template>
      </FormField>
      <div class="grid items-start gap-x-4 gap-y-5 sm:grid-cols-3">
        <FormField id="req-headcount" :label="t('jobRequests.fields.headcount')" :error="errors.headcount">
          <template #default="{ invalid, describedBy }">
            <Input id="req-headcount" type="number" inputmode="numeric" min="1" max="100" step="1" class="figure" :model-value="form.headcount" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="req-headcount" @update:model-value="patch({ headcount: text($event) })" />
          </template>
        </FormField>
        <FormField id="req-salary-min" :label="t('jobRequests.fields.salaryMin')" :hint="t('jobRequests.fields.salaryHint')" :error="errors.salaryMin">
          <template #default="{ invalid, describedBy }">
            <AmountInput id="req-salary-min" :model-value="form.salaryMin" :language="locale" suffix="€" :invalid="invalid" :described-by="describedBy" @update:model-value="patch({ salaryMin: $event })" />
          </template>
        </FormField>
        <FormField id="req-salary-max" :label="t('jobRequests.fields.salaryMax')" :error="errors.salaryMax">
          <template #default="{ invalid, describedBy }">
            <AmountInput id="req-salary-max" :model-value="form.salaryMax" :language="locale" suffix="€" :invalid="invalid" :described-by="describedBy" @update:model-value="patch({ salaryMax: $event })" />
          </template>
        </FormField>
      </div>
    </div>

    <div class="grid gap-5 rounded-xl panel px-5 py-5 sm:px-6">
      <div class="grid gap-1.5">
        <p class="text-sm leading-none font-medium">{{ t('jobRequests.fields.workMode') }}</p>
        <SegmentedControl id="req-work-mode" :model-value="form.workMode" :options="modeOptions" :label="t('jobRequests.fields.workMode')" @update:model-value="patch({ workMode: $event === form.workMode ? '' : $event })" />
      </div>
      <div class="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
        <FormField id="req-location" :label="t('jobRequests.fields.location')" :hint="t('jobRequests.fields.locationHint')">
          <template #default="{ describedBy }">
            <Input id="req-location" :model-value="form.location" maxlength="120" autocomplete="off" :aria-describedby="describedBy" @update:model-value="patch({ location: text($event) })" />
          </template>
        </FormField>
        <FormField id="req-start" :label="t('jobRequests.fields.desiredStart')" :error="errors.desiredStart">
          <template #default="{ invalid, describedBy }">
            <Input id="req-start" type="date" class="figure" :model-value="form.desiredStart" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" @update:model-value="patch({ desiredStart: text($event) })" />
          </template>
        </FormField>
      </div>
      <FormField id="req-process" :label="t('jobRequests.fields.processNotes')" :hint="t('jobRequests.fields.processNotesHint')">
        <template #default="{ describedBy }">
          <Textarea id="req-process" :model-value="form.processNotes" maxlength="2000" rows="2" :aria-describedby="describedBy" @update:model-value="patch({ processNotes: text($event) })" />
        </template>
      </FormField>
      <FormField id="req-interviewers" :label="t('jobRequests.fields.interviewersNotes')" :hint="t('jobRequests.fields.interviewersNotesHint')">
        <template #default="{ describedBy }">
          <Textarea id="req-interviewers" :model-value="form.interviewersNotes" maxlength="2000" rows="2" :aria-describedby="describedBy" @update:model-value="patch({ interviewersNotes: text($event) })" />
        </template>
      </FormField>
    </div>

    <FormAlert :message-key="errorKey" />
    <div class="flex flex-wrap items-center gap-2">
      <Button type="submit" :disabled="pending" data-testid="request-submit">{{ pending ? t('jobRequests.form.submitting') : t('jobRequests.form.submit') }}</Button>
      <Button as-child variant="ghost"><NuxtLink to="/app/job-requests">{{ t('jobRequests.form.cancel') }}</NuxtLink></Button>
    </div>
  </form>
</template>
