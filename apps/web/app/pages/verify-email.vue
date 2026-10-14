<script setup lang="ts">
import { MailCheckIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { safeRedirect, verificationCallback } from '@/lib/auth-paths'
import { errorKeyOf } from '@/lib/auth-errors'

/**
 * "Check your inbox" after sign-up (or a sign-in before confirming), and the landing page of the confirmation link:
 * once that link has signed the person in, this page moves on to `next`; an expired link lands here with `?error=`.
 */
const { t } = useI18n()
const route = useRoute()
const api = useAuthApi()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('auth.verify.title'), robots: 'noindex, nofollow' })

const next = computed(() => safeRedirect(route.query.next))
const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : (viewer.value?.user.email ?? '')))
const expired = computed(() => typeof route.query.error === 'string')

if (viewer.value && viewer.value.user.emailVerified !== false && !expired.value) await navigateTo(next.value ?? '/app', { replace: true })

const busy = ref(false)
const sent = ref(false)
const errorKey = ref<string | null>(null)
const resend = async (): Promise<void> => {
  busy.value = true
  errorKey.value = null
  try {
    await api.sendVerificationEmail({ email: email.value, callbackURL: verificationCallback(next.value) })
    sent.value = true
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="grid gap-8">
    <div class="grid gap-3">
      <span class="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden="true"><MailCheckIcon class="size-5" /></span>
      <h1 class="text-3xl font-semibold tracking-tight">{{ t('auth.verify.title') }}</h1>
      <p class="text-[0.9375rem] text-muted-foreground" data-testid="verify-email-subtitle">
        {{ email ? t('auth.verify.subtitle', { email }) : t('auth.verify.subtitleUnknown') }}
      </p>
      <p class="text-sm text-muted-foreground">{{ t('auth.verify.hint') }}</p>
    </div>
    <FormAlert :message-key="expired ? 'auth.verify.expired' : errorKey" />
    <p v-if="sent" role="status" class="rounded-md bg-muted px-3 py-2 text-sm">{{ t('auth.verify.resent') }}</p>
    <div class="grid gap-3">
      <Button v-if="email" variant="outline" size="lg" :disabled="busy || sent" data-testid="verify-email-resend" @click="resend">
        {{ busy ? t('auth.verify.resending') : t('auth.verify.resend') }}
      </Button>
      <NuxtLink to="/login" rel="nofollow" class="text-sm font-medium text-primary underline-offset-4 hover:underline">{{ t('auth.verify.backToLogin') }}</NuxtLink>
    </div>
  </div>
</template>
