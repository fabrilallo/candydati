<script setup lang="ts">
import type { ConnectedApp } from '@candydati/domain'
import { mcpEndpoint } from '@/lib/api-keys'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Apps connected through OAuth (Claude, ...): every member sees their own, owners and admins everyone's. Revoke behind a confirmation. */
const { t } = useI18n()
const config = useRuntimeConfig()
const { viewer } = useViewer()
const connected = useConnectedApps()
const endpoint = computed(() => mcpEndpoint(config.public.siteUrl))
const seesGuide = computed(() => can(viewer.value?.role ?? null, 'api_key:manage'))
const revoking = ref<ConnectedApp | null>(null)
const revokeOpen = computed({
  get: () => revoking.value !== null,
  set: (open: boolean) => {
    if (!open) revoking.value = null
  },
})
const revokingName = computed(() => revoking.value?.clientName ?? t('connectedApps.unnamed'))
const confirmRevoke = async (): Promise<void> => {
  if (revoking.value && (await connected.revoke(revoking.value))) revoking.value = null
}
</script>

<template>
  <section class="grid gap-4" aria-labelledby="connected-apps-title" data-testid="connected-apps">
    <div class="grid gap-1">
      <h2 id="connected-apps-title" class="text-base font-semibold tracking-tight">{{ t('connectedApps.title') }}</h2>
      <p class="max-w-prose text-sm text-muted-foreground">{{ t('connectedApps.description', { organization: viewer?.organization?.name ?? '' }) }}</p>
    </div>
    <div v-if="connected.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="connected.errorKey.value" />
      <div><Button variant="outline" @click="() => connected.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!connected.apps.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-20 w-full" /></div>
    <div v-else-if="connected.apps.value.length === 0" class="grid gap-2 rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground" data-testid="connected-apps-empty">
      <p class="font-medium text-foreground">{{ t('connectedApps.empty') }}</p>
      <p class="break-words">{{ t('connectedApps.emptyHow', { url: endpoint }) }}</p>
      <p v-if="seesGuide"><NuxtLink to="/app/settings/api" class="font-medium text-link underline-offset-4 hover:underline">{{ t('connectedApps.apiLink') }}</NuxtLink></p>
    </div>
    <ul v-else class="divide-y overflow-hidden rounded-xl panel shadow-xs">
      <ConnectedAppItem
        v-for="app in connected.apps.value"
        :key="app.id"
        :app="app"
        :mine="app.userId === viewer?.user.id"
        :busy="connected.busy.value === app.id"
        @revoke="revoking = app"
      />
    </ul>
    <ConfirmDialog
      v-model:open="revokeOpen"
      :title="t('connectedApps.revokeTitle')"
      :body="revoking ? t('connectedApps.revokeBody', { name: revokingName }) : ''"
      :confirm-label="t('connectedApps.revokeConfirm')"
      :pending="revoking !== null && connected.busy.value === revoking.id"
      destructive
      @confirm="confirmRevoke"
    />
  </section>
</template>
