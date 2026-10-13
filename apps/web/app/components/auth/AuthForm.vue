<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { loginSchema, signupSchema } from '@/lib/schemas'
import { safeRedirect } from '@/lib/auth-paths'

const props = defineProps<{ mode: 'login' | 'signup' }>()
const { t } = useI18n()
const api = useAuthApi()
const route = useRoute()
const { refresh } = useViewer()

const isSignup = computed(() => props.mode === 'signup')
const form = isSignup.value
  ? useZodForm(signupSchema, { name: '', email: '', password: '' })
  : useZodForm(loginSchema, { email: '', password: '' })

const values = computed(() => form.values.value as { name?: string; email: string; password: string })
const set = (key: 'name' | 'email' | 'password', value: string | number): void => (form.setField as (k: string, v: unknown) => void)(key, String(value))

const onSubmit = async (): Promise<void> => {
  const ok = await form.submit(async (data) => {
    if (isSignup.value) await api.signUp(data as { name: string; email: string; password: string })
    else await api.signIn(data)
    await refresh()
  })
  if (ok) await navigateTo(safeRedirect(route.query.redirect) ?? '/app')
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
    <FormAlert :message-key="form.submitError.value" />
    <Button type="submit" size="lg" class="mt-1 w-full" :disabled="form.pending.value">
      {{ form.pending.value ? t(`auth.${mode}.submitting`) : t(`auth.${mode}.submit`) }}
    </Button>
  </form>
</template>
