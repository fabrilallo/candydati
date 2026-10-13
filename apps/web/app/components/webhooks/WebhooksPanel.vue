<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import type { WebhookInput } from '@/lib/automation-api'
import type { WebhookEndpointDto } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Endpoints of the organization, the create flow with the one-time secret, and the signature note for developers. */
const { t } = useI18n()
const hooks = useWebhooks()
const creating = ref(false)
const secret = ref<string | null>(null)
const startCreate = (): void => {
  hooks.clearError()
  secret.value = null
  creating.value = true
}
const create = async (input: WebhookInput): Promise<void> => {
  const created = await hooks.create(input)
  if (created) secret.value = created.secret
}
const finish = (): void => {
  secret.value = null
  creating.value = false
}
const deleting = ref<WebhookEndpointDto | null>(null)
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (open: boolean) => {
    if (!open) deleting.value = null
  },
})
const confirmDelete = async (): Promise<void> => {
  if (deleting.value && (await hooks.remove(deleting.value))) deleting.value = null
}
const test = async (endpoint: WebhookEndpointDto, done: () => void): Promise<void> => {
  if (await hooks.test(endpoint)) done()
}
</script>

<template>
  <div class="grid gap-8">
    <div class="grid gap-4">
      <div class="flex justify-end">
        <Button data-testid="webhook-add" @click="startCreate"><PlusIcon aria-hidden="true" />{{ t('webhooks.add') }}</Button>
      </div>
      <div v-if="hooks.errorKey.value" class="grid gap-3">
        <FormAlert :message-key="hooks.errorKey.value" />
        <div><Button variant="outline" @click="() => hooks.refresh()">{{ t('common.retry') }}</Button></div>
      </div>
      <div v-else-if="!hooks.endpoints.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-20 w-full" /><Skeleton class="h-20 w-full" /></div>
      <p v-else-if="hooks.endpoints.value.length === 0" class="rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground" data-testid="webhooks-empty">{{ t('webhooks.empty') }}</p>
      <ul v-else class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
        <WebhookItem
          v-for="endpoint in hooks.endpoints.value"
          :key="endpoint.id"
          :endpoint="endpoint"
          :busy="hooks.busy.value === endpoint.id"
          @toggle="(enabled) => hooks.setEnabled(endpoint, enabled)"
          @test="(done) => test(endpoint, done)"
          @delete="deleting = endpoint"
        />
      </ul>
    </div>
    <SignatureDocs />
    <WebhookCreateDialog v-model:open="creating" :busy="hooks.busy.value === 'new'" :error-key="hooks.createErrorKey.value" :secret="secret" @create="create" @done="finish" />
    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="t('webhooks.deleteTitle')"
      :body="deleting ? t('webhooks.deleteBody', { url: deleting.url }) : ''"
      :confirm-label="t('webhooks.deleteConfirm')"
      :pending="deleting !== null && hooks.busy.value === deleting.id"
      destructive
      @confirm="confirmDelete"
    />
  </div>
</template>
