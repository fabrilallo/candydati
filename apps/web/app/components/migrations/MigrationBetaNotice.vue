<script setup lang="ts">
import { FlaskConicalIcon } from '@lucide/vue'

/**
 * Shown for a migration built by a beta connector (ADR 0009, decision 6): the connector follows the vendor's public
 * documentation and has not been verified on a real account, so the preview deserves a careful look.
 */
defineProps<{ source: string }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-5 py-4 sm:px-6" role="note" data-testid="migration-beta">
    <FlaskConicalIcon class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
    <div class="grid gap-0.5">
      <p class="text-sm font-semibold text-warning">{{ t('migrations.beta.title') }}</p>
      <p class="text-sm text-foreground">{{ t('migrations.beta.body', { source }) }}</p>
    </div>
  </div>
</template>
