<script setup lang="ts">
/** Where each calendar keeps its secret iCal address. Folded by default: the field stays the first thing. */
const { t } = useI18n()
const PROVIDERS = ['google', 'outlook', 'icloud'] as const
</script>

<template>
  <details class="group rounded-lg border border-input bg-card px-4 py-3 text-sm" data-testid="calendar-how-to">
    <summary class="cursor-pointer font-medium marker:text-muted-foreground">{{ t('calendar.howTo.title') }}</summary>
    <ul class="mt-3 grid gap-2 text-pretty text-muted-foreground">
      <li v-for="provider in PROVIDERS" :key="provider" :data-testid="`calendar-how-to-${provider}`">{{ t(`calendar.howTo.${provider}`) }}</li>
    </ul>
  </details>
</template>
