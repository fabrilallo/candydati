<script setup lang="ts">
import { MailWarningIcon } from '@lucide/vue'

/** Under the top bar while the instance cannot send email: what is closed, and where to fix it for who can. */
const { t } = useI18n()
const { settings } = useInstanceEmailStatus()
</script>

<template>
  <div v-if="settings && !settings.ready" role="status" class="border-b border-warning/30 bg-warning-soft px-4 py-2.5 text-sm text-warning sm:px-6 lg:px-8" data-testid="instance-email-banner">
    <p class="mx-auto flex max-w-7xl flex-wrap items-start gap-x-2 gap-y-1">
      <MailWarningIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0 flex-1 text-pretty">{{ t('instanceEmail.banner.message') }}</span>
      <NuxtLink v-if="settings.canManage" to="/app/settings/email" class="font-medium underline underline-offset-4">{{ t('instanceEmail.banner.link') }}</NuxtLink>
    </p>
  </div>
</template>
