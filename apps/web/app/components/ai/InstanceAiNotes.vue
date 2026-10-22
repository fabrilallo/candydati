<script setup lang="ts">
import { ReceiptTextIcon, ShieldAlertIcon } from '@lucide/vue'

/** What turning a model on means beyond the screen: the provider receives data, and every call is billed. */
const { t } = useI18n()
</script>

<template>
  <div class="grid gap-3">
    <div class="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-3 text-sm text-warning" data-testid="instance-ai-privacy">
      <ShieldAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div class="grid gap-1">
        <p class="font-medium">{{ t('instanceAi.privacy.title') }}</p>
        <p class="text-pretty">{{ t('instanceAi.privacy.body') }}</p>
      </div>
    </div>
    <div class="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm" data-testid="instance-ai-costs">
      <ReceiptTextIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p class="text-pretty text-muted-foreground">
        {{ t('instanceAi.costs.body') }}
        <a href="https://fabrilallo.github.io/candydati/guide/ai" target="_blank" rel="noopener noreferrer" class="font-medium text-link underline-offset-4 hover:underline">{{ t('instanceAi.costs.link') }}</a>
      </p>
    </div>
  </div>
</template>
