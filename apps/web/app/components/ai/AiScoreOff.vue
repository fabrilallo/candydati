<script setup lang="ts">
import { PowerOffIcon } from '@lucide/vue'

/**
 * The ad score exists only with a language model (PRODUCT.md §4.3). Says so calmly; whoever may change the instance
 * models gets the way to the AI settings, everyone else is told whom to ask.
 */
const { t } = useI18n()
const ai = useInstanceAiStatus()
const canManage = computed(() => ai.settings.value?.canManage === true)
</script>

<template>
  <div class="grid gap-1.5" data-testid="quality-ai-off">
    <p class="flex items-center gap-2 text-sm font-medium"><PowerOffIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('quality.aiOff.title') }}</p>
    <p class="max-w-prose text-sm text-pretty text-muted-foreground">{{ t('quality.aiOff.body') }}</p>
    <NuxtLink v-if="canManage" to="/app/settings/ai" class="text-sm font-medium text-link underline-offset-4 hover:underline" data-testid="quality-ai-settings">{{ t('quality.aiOff.admin') }}</NuxtLink>
    <p v-else class="text-sm text-pretty text-muted-foreground" data-testid="quality-ai-ask">{{ t('quality.aiOff.member') }}</p>
  </div>
</template>
