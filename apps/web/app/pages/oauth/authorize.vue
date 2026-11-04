<script setup lang="ts">
import { CircleAlertIcon, LoaderCircleIcon } from '@lucide/vue'
import { errorKeyOf } from '@/lib/auth-errors'
import { continueAuthorization } from '@/lib/connected-app-api'

/**
 * Login page of the OAuth provider: an MCP client (Claude, ...) sent the person here without a session. The auth
 * middleware has them sign in and come back with the signed query intact; then the server is told to continue and
 * answers with the next address (the consent page, or the app if access was already granted).
 */
const { t } = useI18n()
useSeoMeta({ title: () => t('oauth.authorize.pageTitle'), robots: 'noindex, nofollow' })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const request = useJobsApi()
const oauthQuery = useOAuthQuery()
const errorKey = ref<string | null>(oauthQuery ? null : 'oauth.errors.expired')

onMounted(async () => {
  if (!oauthQuery) return
  try {
    await navigateTo(await continueAuthorization(request, oauthQuery), { external: true })
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  }
})
</script>

<template>
  <div class="grid gap-4" aria-live="polite" data-testid="oauth-authorize">
    <div v-if="errorKey" class="grid gap-3" role="alert" data-testid="oauth-failed">
      <span class="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><CircleAlertIcon class="size-5" /></span>
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('oauth.failedTitle') }}</h1>
      <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ t(errorKey) }}</p>
    </div>
    <template v-else>
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('oauth.authorize.pageTitle') }}</h1>
      <p class="flex items-center gap-2 text-[0.9375rem] text-muted-foreground" aria-busy="true">
        <LoaderCircleIcon class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{{ t('oauth.authorize.working') }}
      </p>
    </template>
  </div>
</template>
