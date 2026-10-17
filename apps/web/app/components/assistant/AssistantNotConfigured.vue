<script setup lang="ts">
import { PowerOffIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

/** No model configured: a calm word for everyone, and for whoever administers it, the way to the AI settings. */
const { t } = useI18n()
const { viewer } = useViewer()
const admin = computed(() => can(viewer.value?.role ?? null, 'organization:update'))
</script>

<template>
  <div class="grid gap-3 rounded-xl border border-dashed border-input px-5 py-5" data-testid="assistant-off">
    <p class="flex items-center gap-2 text-sm font-medium"><PowerOffIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('assistant.off.title') }}</p>
    <p class="text-sm text-muted-foreground text-pretty">{{ t('assistant.off.body') }}</p>
    <p v-if="admin" class="text-sm text-pretty">
      <NuxtLink to="/app/settings/ai" class="font-medium text-primary underline-offset-4 hover:underline" data-testid="assistant-off-settings">{{ t('assistant.off.admin') }}</NuxtLink>
    </p>
    <p v-else class="text-sm text-muted-foreground">{{ t('assistant.off.member') }}</p>
  </div>
</template>
