<script setup lang="ts">
import { NAME_MAX, type CandidateCorrection } from '@tt/domain'
import type { CandidateDetailDto } from '@/lib/candidate-schemas'
import { correctionChanges, PHONE_MAX, URL_MAX, validateCorrection, type CorrectionErrors, type CorrectionForm } from '@/lib/gdpr-view'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/** Correction of the contact data. Only changed fields travel; an email of another candidate shows on the field. */
const props = defineProps<{ open: boolean; candidate: CandidateDetailDto['candidate']; name: string; pending: boolean; errorKey: string | null; emailTaken: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; save: [input: CandidateCorrection] }>()
const { t } = useI18n()
const fromCandidate = (): CorrectionForm => ({
  firstName: props.candidate.firstName,
  lastName: props.candidate.lastName,
  email: props.candidate.email,
  phone: props.candidate.phone ?? '',
  linkedinUrl: props.candidate.linkedinUrl ?? '',
})
const form = ref<CorrectionForm>(fromCandidate())
const errors = ref<CorrectionErrors>({})
const nothing = ref(false)
watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.value = fromCandidate()
    errors.value = {}
    nothing.value = false
  },
)
const fieldErrors = computed<CorrectionErrors>(() => (props.emailTaken && !errors.value.email ? { ...errors.value, email: 'gdpr.correct.errors.emailTaken' } : errors.value))
const set = (field: keyof CorrectionForm, value: string | number): void => {
  form.value = { ...form.value, [field]: String(value) }
}
const submit = (): void => {
  errors.value = validateCorrection(form.value)
  if (Object.keys(errors.value).length > 0) return
  const changes = correctionChanges(props.candidate, form.value)
  nothing.value = Object.keys(changes).length === 0
  if (!nothing.value) emit('save', changes)
}
const fields = [
  { field: 'firstName', type: 'text', autocomplete: 'off', max: NAME_MAX },
  { field: 'lastName', type: 'text', autocomplete: 'off', max: NAME_MAX },
  { field: 'email', type: 'email', autocomplete: 'off', max: 254 },
  { field: 'phone', type: 'tel', autocomplete: 'off', max: PHONE_MAX },
  { field: 'linkedinUrl', type: 'url', autocomplete: 'off', max: URL_MAX },
] as const
const labelOf = (field: keyof CorrectionForm): string => t(`gdpr.correct.fields.${field === 'linkedinUrl' ? 'linkedin' : field}`)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg" data-testid="correct-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('gdpr.correct.title', { name }) }}</DialogTitle>
        <DialogDescription>{{ t('gdpr.correct.description') }}</DialogDescription>
      </DialogHeader>
      <form id="correct-form" class="grid gap-5 sm:grid-cols-2" novalidate @submit.prevent="submit">
        <FormField v-for="item in fields" :id="`correct-${item.field}`" :key="item.field" :label="labelOf(item.field)" :error="fieldErrors[item.field]" :class="item.field === 'firstName' || item.field === 'lastName' ? '' : 'sm:col-span-2'">
          <template #default="{ invalid, describedBy }">
            <Input
              :id="`correct-${item.field}`"
              :model-value="form[item.field]"
              :type="item.type"
              :maxlength="item.max"
              :autocomplete="item.autocomplete"
              :aria-invalid="invalid || undefined"
              :aria-describedby="describedBy"
              :data-testid="`correct-${item.field}`"
              @update:model-value="(value) => set(item.field, value)"
            />
          </template>
        </FormField>
        <p v-if="nothing" class="text-sm text-muted-foreground sm:col-span-2" role="status" data-testid="correct-nothing">{{ t('gdpr.correct.nothing') }}</p>
        <FormAlert :message-key="errorKey" class="sm:col-span-2" />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="submit" form="correct-form" :disabled="pending" data-testid="correct-save">{{ pending ? t('gdpr.correct.saving') : t('gdpr.correct.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
