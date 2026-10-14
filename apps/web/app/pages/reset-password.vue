<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resetPasswordSchema } from '@/lib/schemas'

/**
 * Landing page of the emailed reset link (`?token=`), or of an expired one (`?error=`). The token works once; saving
 * signs out every session, so the person signs in again with the new password.
 */
const { t } = useI18n()
const route = useRoute()
const api = useAuthApi()
const { clear } = useViewer()
useSeoMeta({ title: () => t('auth.reset.title'), robots: 'noindex, nofollow' })

const token = computed(() => (typeof route.query.token === 'string' && typeof route.query.error !== 'string' ? route.query.token : null))
const form = useZodForm(resetPasswordSchema, { password: '' })
const invalid = computed(() => token.value === null || form.submitError.value === 'errors.invalidResetLink')

const onSubmit = async (): Promise<void> => {
  if (!token.value) return
  const ok = await form.submit(async ({ password }) => api.resetPassword({ token: token.value as string, newPassword: password }))
  if (!ok) return
  clear()
  toast.success(t('auth.reset.done'))
  await navigateTo('/login')
}
</script>

<template>
  <div class="grid gap-8">
    <template v-if="invalid">
      <div class="grid gap-2">
        <h1 class="text-3xl font-semibold tracking-tight">{{ t('auth.reset.invalidTitle') }}</h1>
        <p class="text-[0.9375rem] text-muted-foreground" data-testid="reset-password-invalid">{{ t('auth.reset.invalidBody') }}</p>
      </div>
      <div><Button variant="outline" as-child><NuxtLink to="/forgot-password" rel="nofollow">{{ t('auth.reset.requestNew') }}</NuxtLink></Button></div>
    </template>
    <template v-else>
      <div class="grid gap-2">
        <h1 class="text-3xl font-semibold tracking-tight">{{ t('auth.reset.title') }}</h1>
        <p class="text-[0.9375rem] text-muted-foreground">{{ t('auth.reset.subtitle') }}</p>
      </div>
      <form class="grid gap-5" novalidate @submit.prevent="onSubmit">
        <FormField id="password" :label="t('auth.reset.password')" :error="form.errors.value.password" :hint="t('auth.passwordHint')">
          <template #default="{ invalid: wrong, describedBy }">
            <Input id="password" type="password" autocomplete="new-password" :model-value="form.values.value.password" :aria-invalid="wrong" :aria-describedby="describedBy" @update:model-value="form.setField('password', String($event))" />
          </template>
        </FormField>
        <FormAlert :message-key="form.submitError.value" />
        <Button type="submit" size="lg" class="w-full" :disabled="form.pending.value">{{ form.pending.value ? t('auth.reset.submitting') : t('auth.reset.submit') }}</Button>
      </form>
    </template>
  </div>
</template>
