<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import type { ApiKeyCreateInput } from '@/lib/api-key-api'
import type { ApiKeyDto } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** The organization's keys, the create flow with the one-time secret, and revoke behind a confirmation. */
const { t } = useI18n()
const keys = useApiKeys()
const now = ref(new Date())
const creating = ref(false)
const secret = ref<string | null>(null)
const startCreate = (): void => {
  keys.clearError()
  secret.value = null
  creating.value = true
}
const create = async (input: ApiKeyCreateInput): Promise<void> => {
  const created = await keys.create(input)
  if (created) secret.value = created.secret
}
const finish = (): void => {
  secret.value = null
  creating.value = false
}
const revoking = ref<ApiKeyDto | null>(null)
const revokeOpen = computed({
  get: () => revoking.value !== null,
  set: (open: boolean) => {
    if (!open) revoking.value = null
  },
})
const confirmRevoke = async (): Promise<void> => {
  if (revoking.value && (await keys.revoke(revoking.value))) revoking.value = null
}
</script>

<template>
  <section class="grid gap-4" aria-labelledby="api-keys-title" data-testid="api-keys">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="grid gap-1">
        <h2 id="api-keys-title" class="text-base font-semibold tracking-tight">{{ t('apiKeys.title') }}</h2>
        <p class="max-w-prose text-sm text-muted-foreground">{{ t('apiKeys.description') }}</p>
      </div>
      <Button data-testid="api-key-add" @click="startCreate"><PlusIcon aria-hidden="true" />{{ t('apiKeys.add') }}</Button>
    </div>
    <div v-if="keys.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="keys.errorKey.value" />
      <div><Button variant="outline" @click="() => keys.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!keys.keys.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-20 w-full" /><Skeleton class="h-20 w-full" /></div>
    <p v-else-if="keys.keys.value.length === 0" class="rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground" data-testid="api-keys-empty">{{ t('apiKeys.empty') }}</p>
    <ul v-else class="divide-y overflow-hidden rounded-xl panel shadow-xs">
      <ApiKeyItem v-for="key in keys.keys.value" :key="key.id" :api-key="key" :now="now" :busy="keys.busy.value === key.id" @revoke="revoking = key" />
    </ul>
    <ApiKeyCreateDialog v-model:open="creating" :busy="keys.busy.value === 'new'" :error-key="keys.createErrorKey.value" :secret="secret" @create="create" @done="finish" />
    <ConfirmDialog
      v-model:open="revokeOpen"
      :title="t('apiKeys.revokeTitle')"
      :body="revoking ? t('apiKeys.revokeBody', { name: revoking.name }) : ''"
      :confirm-label="t('apiKeys.revokeConfirm')"
      :pending="revoking !== null && keys.busy.value === revoking.id"
      destructive
      @confirm="confirmRevoke"
    />
  </section>
</template>
