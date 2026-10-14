<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeRedirect } from '@/lib/auth-paths'
import { twoFactorCodeSchema } from '@/lib/schemas'

/** Second step of a sign-in: the code of the authenticator app, or a backup code. */
const { t } = useI18n()
const route = useRoute()
const api = useAuthApi()
const { refresh } = useViewer()
useSeoMeta({ title: () => t('auth.twoFactor.title'), robots: 'noindex, nofollow' })

const backup = ref(false)
const form = useZodForm(twoFactorCodeSchema, { code: '' })
const toggle = (): void => {
  backup.value = !backup.value
  form.reset({ code: '' })
}
const onSubmit = async (): Promise<void> => {
  const ok = await form.submit(async ({ code }) => {
    if (backup.value) await api.verifyBackupCode(code)
    else await api.verifyTotp(code)
    await refresh()
  })
  if (ok) await navigateTo(safeRedirect(route.query.redirect) ?? '/app')
}
</script>

<template>
  <div class="grid gap-8">
    <div class="grid gap-2">
      <h1 class="text-3xl font-semibold tracking-tight">{{ t('auth.twoFactor.title') }}</h1>
      <p class="text-[0.9375rem] text-muted-foreground">{{ backup ? t('auth.twoFactor.subtitleBackup') : t('auth.twoFactor.subtitle') }}</p>
    </div>
    <form class="grid gap-5" novalidate @submit.prevent="onSubmit">
      <FormField id="code" :label="backup ? t('auth.twoFactor.backupCode') : t('auth.twoFactor.code')" :error="form.errors.value.code">
        <template #default="{ invalid, describedBy }">
          <Input
            id="code"
            autocomplete="one-time-code"
            :inputmode="backup ? 'text' : 'numeric'"
            :model-value="form.values.value.code"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
            class="font-mono tracking-widest"
            @update:model-value="form.setField('code', String($event))"
          />
        </template>
      </FormField>
      <FormAlert :message-key="form.submitError.value" />
      <Button type="submit" size="lg" class="w-full" :disabled="form.pending.value">{{ form.pending.value ? t('auth.twoFactor.submitting') : t('auth.twoFactor.submit') }}</Button>
    </form>
    <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm">
      <button type="button" class="font-medium text-primary underline-offset-4 hover:underline" @click="toggle">{{ backup ? t('auth.twoFactor.useCode') : t('auth.twoFactor.useBackup') }}</button>
      <NuxtLink to="/login" rel="nofollow" class="text-muted-foreground underline-offset-4 hover:underline">{{ t('auth.twoFactor.backToLogin') }}</NuxtLink>
    </div>
  </div>
</template>
