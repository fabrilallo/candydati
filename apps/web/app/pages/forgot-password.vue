<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { forgotPasswordSchema } from '@/lib/schemas'

/** Asks for a reset link. The answer is the same whether the address has an account or not. */
const { t } = useI18n()
const api = useAuthApi()
useSeoMeta({ title: () => t('auth.forgot.title'), robots: 'noindex, nofollow' })

const form = useZodForm(forgotPasswordSchema, { email: '' })
const sentTo = ref<string | null>(null)
const onSubmit = async (): Promise<void> => {
  await form.submit(async ({ email }) => {
    await api.requestPasswordReset({ email, redirectTo: '/reset-password' })
    sentTo.value = email
  })
}
</script>

<template>
  <div class="grid gap-8">
    <template v-if="sentTo">
      <div class="grid gap-2">
        <h1 class="text-3xl font-semibold tracking-tight">{{ t('auth.forgot.sentTitle') }}</h1>
        <p class="text-[0.9375rem] text-muted-foreground" role="status" data-testid="forgot-password-sent">{{ t('auth.forgot.sentBody', { email: sentTo }) }}</p>
      </div>
    </template>
    <template v-else>
      <div class="grid gap-2">
        <h1 class="text-3xl font-semibold tracking-tight">{{ t('auth.forgot.title') }}</h1>
        <p class="text-[0.9375rem] text-muted-foreground">{{ t('auth.forgot.subtitle') }}</p>
      </div>
      <form class="grid gap-5" novalidate @submit.prevent="onSubmit">
        <FormField id="email" :label="t('auth.email')" :error="form.errors.value.email">
          <template #default="{ invalid, describedBy }">
            <Input id="email" type="email" autocomplete="email" inputmode="email" :model-value="form.values.value.email" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="form.setField('email', String($event))" />
          </template>
        </FormField>
        <FormAlert :message-key="form.submitError.value" />
        <Button type="submit" size="lg" class="w-full" :disabled="form.pending.value">{{ form.pending.value ? t('auth.forgot.submitting') : t('auth.forgot.submit') }}</Button>
      </form>
    </template>
    <p class="border-t pt-6 text-sm"><NuxtLink to="/login" rel="nofollow" class="font-medium text-link underline-offset-4 hover:underline">{{ t('auth.forgot.backToLogin') }}</NuxtLink></p>
  </div>
</template>
