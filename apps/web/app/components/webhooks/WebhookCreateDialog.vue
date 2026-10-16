<script setup lang="ts">
import { TriangleAlertIcon } from '@lucide/vue'
import { WEBHOOK_EVENT_TYPES, WEBHOOK_URL_MAX } from '@candydati/domain'
import type { WebhookInput } from '@/lib/automation-api'
import { toggleEvent, validateWebhookForm, type WebhookForm } from '@/lib/automation-view'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/**
 * New endpoint: URL and events. Once created, the same dialog shows the signing secret ONCE, with copy and a warning;
 * it cannot be closed by accident (overlay and Esc do nothing) until the person says they copied it.
 */
const props = defineProps<{ open: boolean; busy: boolean; errorKey: string | null; secret: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; create: [input: WebhookInput]; done: [] }>()
const { t } = useI18n()
const form = ref<WebhookForm>({ url: '', events: [] })
const errors = ref<Partial<Record<keyof WebhookForm, string>>>({})
const copied = ref(false)
const copyFailed = ref(false)
watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.value = { url: '', events: [] }
    errors.value = {}
    copied.value = false
    copyFailed.value = false
  },
)
const submit = (): void => {
  errors.value = validateWebhookForm(form.value)
  if (Object.keys(errors.value).length === 0) emit('create', { url: form.value.url.trim(), events: form.value.events, enabled: true })
}
const copy = async (): Promise<void> => {
  if (!props.secret) return
  try {
    await navigator.clipboard.writeText(props.secret)
    copied.value = true
    copyFailed.value = false
  } catch (error) {
    copyFailed.value = true
    console.error('[webhooks] clipboard refused', error instanceof Error ? error.message : error)
  }
}
const guard = (event: Event): void => {
  if (props.secret) event.preventDefault()
}
const eventKey = (event: string): string => `webhooks.events.${event.replace('.', '_')}`
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => (secret ? undefined : emit('update:open', value))">
    <DialogContent class="sm:max-w-lg" :show-close-button="!secret" data-testid="webhook-dialog" @interact-outside="guard" @escape-key-down="guard">
      <template v-if="secret">
        <DialogHeader>
          <DialogTitle>{{ t('webhooks.secret.title') }}</DialogTitle>
          <DialogDescription>{{ t('webhooks.secret.label') }}</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3">
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm select-all" data-testid="webhook-secret">{{ secret }}</code>
            <Button type="button" variant="outline" size="sm" data-testid="webhook-copy" @click="copy">{{ copied ? t('webhooks.secret.copied') : t('webhooks.secret.copy') }}</Button>
          </div>
          <p v-if="copyFailed" class="text-xs font-medium text-destructive" role="alert">{{ t('webhooks.secret.copyFailed') }}</p>
          <p class="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning" role="alert">
            <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('webhooks.secret.warning') }}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" data-testid="webhook-secret-done" @click="emit('done')">{{ t('webhooks.secret.done') }}</Button>
        </DialogFooter>
      </template>
      <template v-else>
        <DialogHeader>
          <DialogTitle>{{ t('webhooks.newTitle') }}</DialogTitle>
          <DialogDescription>{{ t('webhooks.description') }}</DialogDescription>
        </DialogHeader>
        <form id="webhook-form" class="grid gap-5" novalidate @submit.prevent="submit">
          <FormField id="webhook-url" :label="t('webhooks.fields.url')" :hint="t('webhooks.fields.urlHint')" :error="errors.url">
            <template #default="{ invalid, describedBy }">
              <Input id="webhook-url" v-model="form.url" type="url" inputmode="url" :maxlength="WEBHOOK_URL_MAX" placeholder="https://" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="webhook-url" />
            </template>
          </FormField>
          <fieldset class="grid gap-2" :aria-describedby="errors.events ? 'webhook-events-error' : undefined">
            <legend class="mb-1 text-sm font-medium">{{ t('webhooks.fields.events') }}</legend>
            <label v-for="event in WEBHOOK_EVENT_TYPES" :key="event" class="flex items-center gap-2.5 text-sm">
              <input type="checkbox" class="size-4 accent-primary" :checked="form.events.includes(event)" :data-testid="`webhook-event-${event}`" @change="form = { ...form, events: toggleEvent(form.events, event) }">
              <span>{{ t(eventKey(event)) }}</span>
              <code class="font-mono text-xs text-muted-foreground">{{ event }}</code>
            </label>
            <p v-if="errors.events" id="webhook-events-error" role="alert" class="text-xs font-medium text-destructive">{{ t(errors.events) }}</p>
          </fieldset>
          <FormAlert :message-key="errorKey" />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
          <Button type="submit" form="webhook-form" :disabled="busy" data-testid="webhook-create">{{ busy ? t('webhooks.creating') : t('webhooks.create') }}</Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
