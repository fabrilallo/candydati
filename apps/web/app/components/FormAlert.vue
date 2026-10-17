<script setup lang="ts">
import { CircleAlertIcon } from '@lucide/vue'

defineProps<{ messageKey: string | null }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="messageKey" role="alert" class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
    <CircleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <span>
      {{ t(messageKey) }}
      <!-- An action refused because the instance cannot send email yet: the way to fix it. -->
      <EmailSetupLink v-if="messageKey === 'errors.emailNotConfigured'" />
    </span>
  </div>
</template>
