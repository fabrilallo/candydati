<script setup lang="ts">
import { CircleAlertIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

/** Publishing was refused because the organization has no privacy notice yet: say so, and where to fix it. */
const { t } = useI18n()
const { viewer } = useViewer()
const canManage = computed(() => can(viewer.value?.role ?? null, 'privacy:manage'))
</script>

<template>
  <div role="alert" class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="privacy-required">
    <CircleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <p>
      {{ t('job.errors.privacyNoticeRequired') }}
      <NuxtLink v-if="canManage" to="/app/settings/privacy" class="font-medium underline underline-offset-4">{{ t('job.errors.privacyNoticeLink') }}</NuxtLink>
      <span v-else>{{ t('job.errors.privacyNoticeAskAdmin') }}</span>
    </p>
  </div>
</template>
