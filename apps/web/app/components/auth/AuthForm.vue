<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { loginSchema, signupSchema } from '@/lib/schemas'
import { safeRedirect, verificationCallback, VERIFY_EMAIL } from '@/lib/auth-paths'
import { AppError } from '@/lib/auth-errors'
import { forgetSetupCode, takeSetupCode } from '@/lib/setup-code'

const props = defineProps<{ mode: 'login' | 'signup' }>()
const { t } = useI18n()
const api = useAuthApi()
const route = useRoute()
const { refresh } = useViewer()

const isSignup = computed(() => props.mode === 'signup')
/**
 * `/signup?setup#code=...`: the first owner's sign-up, through the link the api logs at first start. The code is read
 * from the link (kept for this tab, so a reload does not lose it) and sent as a header: nothing to see or type.
 */
const isSetup = computed(() => isSignup.value && route.query.setup !== undefined)
const setupCode = ref('')
const router = useRouter()
onMounted(() => {
  if (isSetup.value) setupCode.value = takeSetupCode(route.hash)
  // Off the address bar (and the history) once read.
  if (route.hash !== '') void router.replace({ query: route.query, hash: '' })
})
const form = isSignup.value
  ? useZodForm(signupSchema, { name: '', email: '', password: '' })
  : useZodForm(loginSchema, { email: '', password: '' })

const values = computed(() => form.values.value as { name?: string; email: string; password: string })
const set = (key: 'name' | 'email' | 'password', value: string | number): void => (form.setField as (k: string, v: unknown) => void)(key, String(value))

const redirect = computed(() => safeRedirect(route.query.redirect))
/** Where the confirmation link lands once it has signed the person in. */
const callbackURL = computed(() => verificationCallback(redirect.value))
const withRedirect = (query: Record<string, string>): Record<string, string> => (redirect.value ? { ...query, redirect: redirect.value } : query)
const inbox = (email: string): Next => ({ path: VERIFY_EMAIL, query: redirect.value ? { email, next: redirect.value } : { email } })

/** What comes after a successful submit: the inbox, the second factor, or the app. */
type Next = { readonly path: string; readonly query?: Record<string, string> } | string

const signUp = async (data: { name: string; email: string; password: string }): Promise<Next> => {
  const { confirmed } = await api.signUp({ ...data, callbackURL: callbackURL.value, ...(isSetup.value && setupCode.value !== '' ? { bootstrapToken: setupCode.value } : {}) })
  if (!confirmed) return inbox(data.email)
  forgetSetupCode()
  // The first owner: the setup code confirmed the address, so straight in, to create the organization.
  await api.signIn({ email: data.email, password: data.password })
  await refresh()
  return '/onboarding'
}

const signIn = async (data: { email: string; password: string }): Promise<Next> => {
  try {
    const { twoFactor } = await api.signIn({ ...data, callbackURL: callbackURL.value })
    if (twoFactor) return { path: '/two-factor', query: withRedirect({}) }
  } catch (error) {
    // A fresh confirmation link is already on its way: the inbox page says so.
    if (error instanceof AppError && error.code === 'EMAIL_NOT_VERIFIED') return inbox(data.email)
    throw error
  }
  await refresh()
  return redirect.value ?? '/app'
}

const onSubmit = async (): Promise<void> => {
  let next: Next = '/app'
  const ok = await form.submit(async (data) => {
    next = isSignup.value ? await signUp(data as { name: string; email: string; password: string }) : await signIn(data)
  })
  if (ok) await navigateTo(next)
}
</script>

<template>
  <form class="grid gap-5" novalidate @submit.prevent="onSubmit">
    <FormField v-if="isSignup" id="name" :label="t('auth.name')" :error="form.errors.value.name">
      <template #default="{ invalid, describedBy }">
        <Input id="name" autocomplete="name" :model-value="values.name" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="set('name', $event)" />
      </template>
    </FormField>
    <FormField id="email" :label="t('auth.email')" :error="form.errors.value.email">
      <template #default="{ invalid, describedBy }">
        <Input id="email" type="email" autocomplete="email" inputmode="email" :model-value="values.email" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="set('email', $event)" />
      </template>
    </FormField>
    <FormField id="password" :label="t('auth.password')" :error="form.errors.value.password" :hint="isSignup ? t('auth.passwordHint') : undefined">
      <template #default="{ invalid, describedBy }">
        <Input id="password" type="password" :autocomplete="isSignup ? 'new-password' : 'current-password'" :model-value="values.password" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="set('password', $event)" />
      </template>
    </FormField>
    <p v-if="!isSignup" class="-mt-2 text-sm">
      <NuxtLink to="/forgot-password" rel="nofollow" class="font-medium text-link underline-offset-4 hover:underline" data-testid="forgot-password-link">{{ t('auth.login.forgot') }}</NuxtLink>
    </p>
    <FormAlert :message-key="form.submitError.value" />
    <Button type="submit" size="lg" class="mt-1 w-full" :disabled="form.pending.value">
      {{ form.pending.value ? t(`auth.${mode}.submitting`) : t(`auth.${mode}.submit`) }}
    </Button>
  </form>
</template>
