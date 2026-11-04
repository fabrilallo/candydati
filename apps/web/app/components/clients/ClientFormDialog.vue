<script setup lang="ts">
import { CLIENT_CONTACTS_MAX, CLIENT_NAME_MAX, type ClientDto, type ClientInput } from '@candydati/domain'
import { PlusIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter, DialogHeader, DialogDescription, DialogScrollContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { addContact, checkClientForm, clientFormOf, clientIssueErrors, emptyClientForm, patchContact, removeContact, type ClientForm, type ClientFormErrors } from '@/lib/client-view'
import type { ClientSaveResult } from '@/composables/useClients'

/** Create or edit a client: name, website, https logo, contacts (name and email). The parent saves; errors come back here. */
const props = defineProps<{ open: boolean; client: ClientDto | null; save: (input: ClientInput) => Promise<ClientSaveResult> }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const form = ref<ClientForm>(emptyClientForm())
const errors = ref<ClientFormErrors>({})
const errorKey = ref<string | null>(null)
const pending = ref(false)
let nextKey = 0

watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.value = props.client ? clientFormOf(props.client) : emptyClientForm()
    errors.value = {}
    errorKey.value = null
  },
  { immediate: true },
)
const set = (patch: Partial<Omit<ClientForm, 'contacts'>>): void => {
  form.value = { ...form.value, ...patch }
}
const add = (): void => {
  nextKey += 1
  form.value = addContact(form.value, `new-${nextKey}`)
}

const submit = async (): Promise<void> => {
  errorKey.value = null
  const check = checkClientForm(form.value)
  errors.value = check.ok ? {} : check.errors
  if (!check.ok) return
  pending.value = true
  const result = await props.save(check.input)
  pending.value = false
  if (result.ok) return emit('update:open', false)
  errors.value = clientIssueErrors(form.value, result.issues)
  errorKey.value = result.errorKey
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogScrollContent class="sm:max-w-xl">
      <form class="grid gap-5" novalidate data-testid="client-form" @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>{{ t(client ? 'clients.form.editTitle' : 'clients.form.createTitle') }}</DialogTitle>
          <DialogDescription>{{ t('clients.form.description') }}</DialogDescription>
        </DialogHeader>
        <FormField id="client-name" :label="t('clients.form.name')" :error="errors.name">
          <template #default="{ invalid, describedBy }">
            <Input id="client-name" :model-value="form.name" :maxlength="CLIENT_NAME_MAX" autocomplete="organization" :aria-invalid="invalid" :aria-describedby="describedBy" data-testid="client-name" @update:model-value="set({ name: String($event) })" />
          </template>
        </FormField>
        <FormField id="client-website" :label="t('clients.form.website')" :error="errors.website">
          <template #default="{ invalid, describedBy }">
            <Input id="client-website" :model-value="form.website" type="url" inputmode="url" placeholder="https://" :aria-invalid="invalid" :aria-describedby="describedBy" data-testid="client-website" @update:model-value="set({ website: String($event) })" />
          </template>
        </FormField>
        <FormField id="client-logo" :label="t('clients.form.logoUrl')" :hint="t('clients.form.logoHint')" :error="errors.logoUrl">
          <template #default="{ invalid, describedBy }">
            <Input id="client-logo" :model-value="form.logoUrl" type="url" inputmode="url" placeholder="https://" :aria-invalid="invalid" :aria-describedby="describedBy" data-testid="client-logo" @update:model-value="set({ logoUrl: String($event) })" />
          </template>
        </FormField>

        <fieldset class="grid gap-3">
          <legend class="mb-1 text-sm font-medium">{{ t('clients.form.contacts') }}</legend>
          <p class="text-xs text-muted-foreground">{{ t('clients.form.contactsHint', { max: CLIENT_CONTACTS_MAX }) }}</p>
          <div v-for="(contact, index) in form.contacts" :key="contact.key" class="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start" data-testid="client-contact">
            <FormField :id="`contact-${contact.key}-name`" :label="t('clients.form.contactName')" :error="errors[`contact-${contact.key}-name`]">
              <template #default="{ invalid, describedBy }">
                <Input :id="`contact-${contact.key}-name`" :model-value="contact.name" autocomplete="off" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="form = patchContact(form, contact.key, { name: String($event) })" />
              </template>
            </FormField>
            <FormField :id="`contact-${contact.key}-email`" :label="t('clients.form.contactEmail')" :error="errors[`contact-${contact.key}-email`]">
              <template #default="{ invalid, describedBy }">
                <Input :id="`contact-${contact.key}-email`" :model-value="contact.email" type="email" autocomplete="off" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="form = patchContact(form, contact.key, { email: String($event) })" />
              </template>
            </FormField>
            <Button type="button" variant="ghost" size="icon" class="sm:mt-6" :aria-label="t('clients.form.removeContact', { name: contact.name || t('clients.form.contactFallback', { n: index + 1 }) })" @click="form = removeContact(form, contact.key)">
              <Trash2Icon aria-hidden="true" />
            </Button>
          </div>
          <p v-if="errors.contacts" role="alert" class="text-xs font-medium text-destructive">{{ t(errors.contacts) }}</p>
          <div>
            <Button type="button" variant="outline" size="sm" :disabled="form.contacts.length >= CLIENT_CONTACTS_MAX" data-testid="client-add-contact" @click="add"><PlusIcon aria-hidden="true" />{{ t('clients.form.addContact') }}</Button>
          </div>
        </fieldset>

        <FormAlert :message-key="errorKey" />
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('clients.form.cancel') }}</Button>
          <Button type="submit" :disabled="pending" data-testid="client-save">{{ t('clients.form.save') }}</Button>
        </DialogFooter>
      </form>
    </DialogScrollContent>
  </Dialog>
</template>
