<script setup lang="ts">
import { SOURCING_SOURCES, type SourcedContactInput } from '@candydati/domain'
import { validateContactForm, type ContactForm, type ContactFormErrors } from '@/lib/sourcing-view'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

/** Add by hand a person found outside Candydati: name, where the profile is, and what in it fits the job. */
const props = defineProps<{ open: boolean; busy: boolean; errorKey: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; save: [input: SourcedContactInput] }>()
const { t } = useI18n()
const EMPTY: ContactForm = { firstName: '', lastName: '', headline: '', location: '', source: 'linkedin', profileUrl: '', evidence: '' }
const form = ref<ContactForm>(EMPTY)
const errors = ref<ContactFormErrors>({})
watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.value = EMPTY
    errors.value = {}
  },
)
const patch = (change: Partial<ContactForm>): void => {
  form.value = { ...form.value, ...change }
}
const submit = (): void => {
  const result = validateContactForm(form.value)
  errors.value = result.errors
  if (result.input) emit('save', result.input)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="add-contact-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('sourcing.add.title') }}</DialogTitle>
        <DialogDescription>{{ t('sourcing.add.description') }}</DialogDescription>
      </DialogHeader>
      <form id="add-contact-form" class="grid gap-4" novalidate @submit.prevent="submit">
        <div class="grid gap-4 sm:grid-cols-2">
          <FormField id="contact-first-name" :label="t('sourcing.add.firstName')" :error="errors.firstName">
            <template #default="{ invalid, describedBy }">
              <Input id="contact-first-name" :model-value="form.firstName" maxlength="80" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="contact-first-name" @update:model-value="patch({ firstName: String($event) })" />
            </template>
          </FormField>
          <FormField id="contact-last-name" :label="t('sourcing.add.lastName')">
            <Input id="contact-last-name" :model-value="form.lastName" maxlength="80" @update:model-value="patch({ lastName: String($event) })" />
          </FormField>
        </div>
        <FormField id="contact-profile-url" :label="t('sourcing.add.profileUrl')" :error="errors.profileUrl">
          <template #default="{ invalid, describedBy }">
            <Input id="contact-profile-url" type="url" :model-value="form.profileUrl" placeholder="https://www.linkedin.com/in/…" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="contact-profile-url" @update:model-value="patch({ profileUrl: String($event) })" />
          </template>
        </FormField>
        <div class="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <FormField id="contact-source" :label="t('sourcing.add.source')">
            <NativeSelect id="contact-source" :model-value="form.source" data-testid="contact-source" @update:model-value="patch({ source: $event as ContactForm['source'] })">
              <option v-for="source in SOURCING_SOURCES" :key="source" :value="source">{{ t(`sourcing.sources.${source}`) }}</option>
            </NativeSelect>
          </FormField>
          <FormField id="contact-headline" :label="t('sourcing.add.headline')">
            <Input id="contact-headline" :model-value="form.headline" maxlength="200" @update:model-value="patch({ headline: String($event) })" />
          </FormField>
        </div>
        <FormField id="contact-location" :label="t('sourcing.add.location')">
          <Input id="contact-location" :model-value="form.location" maxlength="120" @update:model-value="patch({ location: String($event) })" />
        </FormField>
        <FormField id="contact-evidence" :label="t('sourcing.add.evidence')" :hint="t('sourcing.add.evidenceHint')">
          <Textarea id="contact-evidence" :model-value="form.evidence" rows="3" data-testid="contact-evidence-input" @update:model-value="patch({ evidence: String($event) })" />
        </FormField>
        <FormAlert :message-key="errorKey" />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="submit" form="add-contact-form" :disabled="busy" data-testid="add-contact-save">{{ t('sourcing.add.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
