<script setup lang="ts">
import { RefreshCwIcon, ReplyIcon } from '@lucide/vue'
import { domainStatusView, emailSettingsInput, SENDER_NAME_MAX, validateEmailSettings, type EmailSettingsForm } from '@/lib/email-settings-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Who candidates see as sender: the effective From, the sender name, the optional own address with the status of its
 * domain and the DNS records to publish. Replies always come back to the platform, whatever the From.
 */
const { t } = useI18n()
const s = useEmailSettings()
const settings = computed(() => s.settings.value)
const status = computed(() => (settings.value ? domainStatusView(settings.value) : null))
const form = ref<EmailSettingsForm>({ senderName: '', fromAddress: '' })
watch(
  settings,
  (fresh) => {
    if (fresh) form.value = { senderName: fresh.senderName, fromAddress: fresh.fromAddress ?? '' }
  },
  { immediate: true },
)
const errors = ref<ReturnType<typeof validateEmailSettings>>({})
const save = async (): Promise<void> => {
  errors.value = validateEmailSettings(form.value)
  if (Object.keys(errors.value).length === 0) await s.save(emailSettingsInput(form.value))
}
</script>

<template>
  <div class="grid gap-8">
    <div v-if="s.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="s.errorKey.value" />
      <div><Button variant="outline" @click="() => s.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!settings || !status" class="grid gap-4" aria-busy="true" data-testid="email-settings-loading">
      <Skeleton class="h-28 w-full rounded-xl" />
      <Skeleton class="h-64 w-full rounded-xl" />
    </div>
    <template v-else>
      <section class="grid gap-3 rounded-xl panel px-5 py-5 sm:px-6" aria-labelledby="email-effective" data-testid="email-effective">
        <h2 id="email-effective" class="text-base font-semibold tracking-tight">{{ t('emailSettings.effective.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('emailSettings.effective.from') }}</p>
        <p class="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all" data-testid="effective-from">{{ settings.effectiveFrom }}</p>
        <p class="flex items-start gap-2 text-sm text-muted-foreground" data-testid="replies-line">
          <ReplyIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('emailSettings.effective.replies') }}
        </p>
      </section>

      <form class="grid max-w-xl gap-5" novalidate data-testid="email-settings-form" @submit.prevent="save">
        <h2 class="text-lg font-semibold tracking-tight">{{ t('emailSettings.form.title') }}</h2>
        <FormField id="sender-name" :label="t('emailSettings.form.senderName')" :hint="t('emailSettings.form.senderNameHint')" :error="errors.senderName">
          <template #default="{ invalid, describedBy }">
            <Input id="sender-name" v-model="form.senderName" :maxlength="SENDER_NAME_MAX" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="sender-name" />
          </template>
        </FormField>
        <FormField id="from-address" :label="t('emailSettings.form.fromAddress')" :hint="t('emailSettings.form.fromAddressHint')" :error="errors.fromAddress">
          <template #default="{ invalid, describedBy }">
            <Input id="from-address" v-model="form.fromAddress" type="email" autocomplete="off" :placeholder="t('emailSettings.form.fromAddressPlaceholder')" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="from-address" />
          </template>
        </FormField>
        <FormAlert :message-key="s.actionErrorKey.value" />
        <div><Button type="submit" :disabled="s.busy.value !== null" data-testid="email-settings-save">{{ s.busy.value === 'save' ? t('emailSettings.form.saving') : t('emailSettings.form.save') }}</Button></div>
      </form>

      <section v-if="settings.domain" class="grid gap-4" aria-labelledby="email-domain" data-testid="email-domain">
        <div class="flex flex-wrap items-center gap-3">
          <h2 id="email-domain" class="text-lg font-semibold tracking-tight">{{ t('emailSettings.domain.title', { domain: settings.domain.name }) }}</h2>
          <Badge :variant="status.tone" data-testid="domain-status">{{ t(status.key) }}</Badge>
          <Button v-if="status.canVerify" variant="outline" size="sm" class="ml-auto" :disabled="s.busy.value !== null" data-testid="domain-verify" @click="s.verify">
            <RefreshCwIcon :class="s.busy.value === 'verify' ? 'animate-spin motion-reduce:animate-none' : ''" aria-hidden="true" />{{ t('emailSettings.domain.verify') }}
          </Button>
        </div>
        <p class="max-w-2xl text-sm text-muted-foreground" data-testid="domain-explain">{{ t(`emailSettings.domain.explain.${status.state}`) }}</p>
        <DnsRecordsTable v-if="status.showRecords && settings.domain.records.length > 0" :records="settings.domain.records" />
      </section>
    </template>
  </div>
</template>
