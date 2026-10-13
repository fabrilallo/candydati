<script setup lang="ts">
import { UsersRoundIcon } from '@lucide/vue'

/** Honest note: the candidate figures are not shown because they do not exist yet. No placeholder numbers. */
const { t } = useI18n()
const upcoming = ['funnel', 'timeToHire', 'responseKept'] as const
</script>

<template>
  <section aria-labelledby="candidate-metrics-title" class="flex h-full flex-col gap-3 rounded-xl border border-dashed px-5 py-5 sm:px-6" data-testid="candidate-metrics-note">
    <div class="flex items-center gap-2.5">
      <span class="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true"><UsersRoundIcon class="size-4" /></span>
      <h2 id="candidate-metrics-title" class="text-sm font-semibold tracking-tight">{{ t('dashboard.stats.candidates.title') }}</h2>
    </div>
    <p class="text-sm text-muted-foreground">{{ t('dashboard.stats.candidates.body') }}</p>
    <ul class="flex flex-wrap gap-1.5">
      <li v-for="item in upcoming" :key="item" class="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">{{ t(`dashboard.stats.candidates.items.${item}`) }}</li>
    </ul>
  </section>
</template>
