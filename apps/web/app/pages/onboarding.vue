<script setup lang="ts">
import { toast } from 'vue-sonner'

const { t } = useI18n()
const { refresh } = useViewer()
useSeoMeta({ title: () => t('onboarding.title') })

const onCreated = async (): Promise<void> => {
  toast.success(t('onboarding.created'))
  await refresh()
  await navigateTo('/app')
}
</script>

<template>
  <div class="grid gap-6">
    <div class="grid gap-1.5">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('onboarding.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('onboarding.subtitle') }}</p>
    </div>
    <OnboardingForm @created="onCreated" />
  </div>
</template>
