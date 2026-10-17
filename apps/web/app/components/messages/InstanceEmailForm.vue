<script setup lang="ts">
import type { InstanceEmailSettingsDto } from '@candydati/domain'
import { CircleCheckIcon } from '@lucide/vue'
import { formFromSettings, fromPreview, instanceEmailInput, testFailureHintKey, withPort, type InstanceEmailErrors, type InstanceEmailForm, type InstanceEmailProvider } from '@/lib/instance-email-view'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * The instance's sending service. Secrets are never shown: a stored one is said to be there and kept when the field
 * stays empty. Saving sends a test email to the admin first; nothing is stored if the provider refuses it.
 */
const props = defineProps<{ settings: InstanceEmailSettingsDto }>()
const { t } = useI18n()
const e = useInstanceEmail()
const PROVIDERS: readonly InstanceEmailProvider[] = ['smtp', 'resend']
const form = ref<InstanceEmailForm>(formFromSettings(props.settings))
const errors = ref<InstanceEmailErrors>({})
const preview = computed(() => fromPreview(form.value))
const set = <K extends keyof InstanceEmailForm>(field: K, value: InstanceEmailForm[K]): void => {
  form.value = { ...form.value, [field]: value }
}
const setSmtp = (field: 'host' | 'secure' | 'user' | 'password', value: string | boolean): void => {
  form.value = field === 'secure' ? { ...form.value, secure: value === true } : { ...form.value, [field]: String(value) }
}
const setPort = (value: string | number): void => {
  form.value = withPort(form.value, String(value))
}
const secretPlaceholder = (stored: boolean | undefined): string | undefined => (stored ? t('instanceEmail.form.secretKept') : undefined)

const save = async (): Promise<void> => {
  const result = instanceEmailInput(form.value)
  errors.value = result.ok ? {} : result.errors
  if (!result.ok) return
  // A saved secret is never sent back: the fields empty again and show it is stored.
  if (await e.save(result.input)) form.value = { ...form.value, password: '', apiKey: '' }
}
</script>

<template>
  <form class="grid max-w-xl gap-5" novalidate data-testid="instance-email-form" @submit.prevent="save">
    <fieldset class="grid gap-2">
      <legend class="mb-2 text-sm font-medium">{{ t('instanceEmail.provider') }}</legend>
      <div class="grid gap-2 sm:grid-cols-2">
        <label v-for="provider in PROVIDERS" :key="provider" class="flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
          <input type="radio" name="instance-email-provider" class="mt-0.5 size-4 shrink-0 accent-primary" :value="provider" :checked="form.provider === provider" :data-testid="`provider-${provider}`" @change="set('provider', provider)">
          <span class="grid gap-0.5">
            <span class="font-medium">{{ t(`instanceEmail.providers.${provider}`) }}</span>
            <span class="text-xs text-muted-foreground">{{ t(`instanceEmail.providerHint.${provider}`) }}</span>
          </span>
        </label>
      </div>
    </fieldset>

    <InstanceEmailSmtpFields v-if="form.provider === 'smtp'" :form="form" :errors="errors" :has-password="settings.smtp?.hasPassword ?? false" @set="setSmtp" @port="setPort" />
    <FormField v-else id="resend-api-key" :label="t('instanceEmail.form.apiKey')" :error="errors.apiKey">
      <template #default="{ invalid, describedBy }">
        <Input id="resend-api-key" type="password" autocomplete="off" :model-value="form.apiKey" :placeholder="secretPlaceholder(settings.resend?.hasApiKey)" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="resend-api-key" @update:model-value="set('apiKey', String($event))" />
      </template>
    </FormField>

    <FormField id="sending-domain" :label="t('instanceEmail.form.sendingDomain')" :hint="t('instanceEmail.form.sendingDomainHint')" :error="errors.sendingDomain">
      <template #default="{ invalid, describedBy }">
        <Input id="sending-domain" autocomplete="off" spellcheck="false" :model-value="form.sendingDomain" :placeholder="t('instanceEmail.form.sendingDomainPlaceholder')" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="sending-domain" @update:model-value="set('sendingDomain', String($event))" />
      </template>
    </FormField>
    <FormField id="from-local" :label="t('instanceEmail.form.fromLocal', { at: '@' })" :error="errors.fromLocal">
      <template #default="{ invalid, describedBy }">
        <Input id="from-local" autocomplete="off" spellcheck="false" :model-value="form.fromLocal" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="from-local" @update:model-value="set('fromLocal', String($event))" />
      </template>
    </FormField>
    <p v-if="preview" class="grid gap-1 text-sm" aria-live="polite">
      <span class="text-muted-foreground">{{ t('instanceEmail.form.fromPreview') }}</span>
      <span class="w-fit rounded-md bg-muted px-3 py-2 font-mono break-all" data-testid="from-preview">{{ preview }}</span>
    </p>

    <div v-if="e.errorKey.value" class="grid gap-2">
      <FormAlert :message-key="e.errorKey.value" />
      <p v-if="e.testFailed.value" class="text-sm text-muted-foreground" data-testid="test-failed-hint">{{ t(testFailureHintKey(form.provider)) }}</p>
    </div>
    <p v-else-if="e.sentTo.value !== null" role="status" class="flex items-start gap-2 text-sm text-success" data-testid="test-sent">
      <CircleCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {{ e.sentTo.value ? t('instanceEmail.test.sent', { email: e.sentTo.value }) : t('instanceEmail.test.sentNoAddress') }}
    </p>
    <div><Button type="submit" :disabled="e.busy.value" data-testid="instance-email-save">{{ e.busy.value ? t('instanceEmail.form.saving') : t('instanceEmail.form.save') }}</Button></div>
  </form>
</template>
