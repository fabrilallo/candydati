<script setup lang="ts">
/** The way to the email settings, for whoever may configure the instance's email (others are told in the message). */
const { t } = useI18n()
const { settings } = useInstanceEmailStatus()
</script>

<template>
  <NuxtLink v-if="settings?.canManage" to="/app/settings/email" class="font-medium underline underline-offset-4" data-testid="email-setup-link">{{ t('errors.emailNotConfiguredLink') }}</NuxtLink>
</template>
