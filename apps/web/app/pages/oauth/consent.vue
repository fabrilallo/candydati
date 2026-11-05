<script setup lang="ts">
import { CircleAlertIcon, PlugIcon } from '@lucide/vue'
import { SECURITY_SETTINGS } from '@/lib/auth-paths'
import { redirectHost } from '@/lib/oauth-flow'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Consent page of the OAuth provider: who asks (as the app declares itself), where the browser goes after the answer,
 * the organization the connection is for, and what the app can and cannot do there, with the opt-in to propose moves
 * (unchecked) when the app asked for it. Allow or deny, then the server sends the browser back to the app.
 */
const { t } = useI18n()
useSeoMeta({ title: () => t('oauth.consent.pageTitle'), robots: 'noindex, nofollow' })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })
const consent = useOAuthConsent(useOAuthQuery())
const { preview, selected } = consent
const host = computed(() => (preview.value ? (redirectHost(preview.value.client.redirectUri) ?? preview.value.client.redirectUri) : ''))
const title = computed(() => (preview.value?.client.name ? t('oauth.consent.title', { name: preview.value.client.name }) : t('oauth.consent.titleUnnamed')))
const optionLabel = (organization: { name: string; twoFactorRequired: boolean }): string =>
  organization.twoFactorRequired ? t('oauth.consent.twoFactorOption', { name: organization.name }) : organization.name
const showsTwoFactorLink = computed(() => selected.value?.twoFactorRequired === true || consent.errorKey.value === 'oauth.errors.twoFactorRequired')
onMounted(consent.load)
</script>

<template>
  <div class="grid gap-6" data-testid="oauth-consent">
    <div v-if="consent.loadErrorKey.value" class="grid gap-3" role="alert" data-testid="oauth-failed">
      <span class="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><CircleAlertIcon class="size-5" /></span>
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('oauth.failedTitle') }}</h1>
      <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ t(consent.loadErrorKey.value) }}</p>
    </div>
    <div v-else-if="!preview" class="grid gap-3" aria-busy="true" :aria-label="t('oauth.consent.loading')"><Skeleton class="h-8 w-3/4" /><Skeleton class="h-24 w-full" /></div>
    <template v-else>
      <header class="grid gap-3">
        <span class="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true"><PlugIcon class="size-5" /></span>
        <h1 class="text-2xl font-semibold tracking-tight text-balance" data-testid="consent-title">{{ title }}</h1>
        <p v-if="preview.client.uri" class="truncate font-mono text-xs text-muted-foreground" data-testid="consent-client-uri">{{ preview.client.uri }}</p>
        <p class="text-xs text-muted-foreground">{{ t('oauth.consent.declared') }}</p>
        <p class="rounded-lg panel px-4 py-3 text-sm">
          {{ t('oauth.consent.returnTo') }} <strong class="font-mono text-[0.9375rem] font-semibold break-all" data-testid="consent-host">{{ host }}</strong>
        </p>
      </header>
      <p v-if="preview.organizations.length === 0" class="text-[0.9375rem] text-pretty" role="alert" data-testid="consent-no-organization">{{ t('oauth.consent.noOrganization') }}</p>
      <template v-else>
        <div class="grid gap-1.5">
          <Label for="consent-organization">{{ t('oauth.consent.organization') }}</Label>
          <NativeSelect id="consent-organization" :model-value="consent.selectedId.value ?? undefined" aria-describedby="consent-organization-hint" :disabled="consent.pending.value !== null" data-testid="consent-organization" @update:model-value="(value) => (consent.selectedId.value = value)">
            <option v-for="organization in preview.organizations" :key="organization.id" :value="organization.id">{{ optionLabel(organization) }}</option>
          </NativeSelect>
          <p id="consent-organization-hint" class="text-xs text-muted-foreground">{{ t('oauth.consent.organizationHint') }}</p>
        </div>
        <p v-if="selected?.twoFactorRequired" class="text-sm text-warning" data-testid="consent-two-factor">{{ t('oauth.consent.twoFactorWarning', { name: selected.name }) }}</p>
        <ConnectorPermissions v-if="selected" :role="selected.role" :organization="selected.name" />
        <label v-if="consent.offersPropose.value" class="flex items-start gap-2.5 rounded-lg panel px-4 py-3 text-sm" data-testid="consent-propose-move">
          <input v-model="consent.proposeMove.value" type="checkbox" class="mt-0.5 size-4 shrink-0 accent-primary" :disabled="consent.pending.value !== null" data-testid="consent-propose-move-input">
          <span class="grid gap-0.5">
            <span class="font-medium">{{ t('oauth.consent.proposeMove') }}</span>
            <span class="text-xs text-pretty text-muted-foreground">{{ t('oauth.consent.proposeMoveHint') }}</span>
          </span>
        </label>
      </template>
      <div aria-live="assertive">
        <FormAlert :message-key="consent.errorKey.value" />
      </div>
      <p v-if="showsTwoFactorLink"><NuxtLink :to="SECURITY_SETTINGS" class="text-sm font-medium text-link underline-offset-4 hover:underline" data-testid="consent-two-factor-link">{{ t('oauth.consent.twoFactorLink') }}</NuxtLink></p>
      <div class="flex flex-wrap gap-3">
        <Button :disabled="!consent.canAllow.value" data-testid="consent-allow" @click="consent.answer('allow')">{{ t('oauth.consent.allow') }}</Button>
        <Button variant="outline" :disabled="consent.pending.value !== null" data-testid="consent-deny" @click="consent.answer('deny')">{{ t('oauth.consent.deny') }}</Button>
      </div>
    </template>
  </div>
</template>
