<script setup lang="ts">
import { LockKeyholeIcon } from '@lucide/vue'

/**
 * What a 404 from the api looks like: the record is gone, or it belongs to a job whose team the viewer is not on (the
 * api does not say which, on purpose). A calm empty state with a way back, never an error.
 */
defineProps<{ backTo: string; backKey: string }>()
const { t } = useI18n()
</script>

<template>
  <section class="grid justify-items-start gap-3 rounded-xl border border-dashed px-5 py-8 sm:px-6" data-testid="not-accessible" aria-labelledby="not-accessible-title">
    <LockKeyholeIcon class="size-5 text-muted-foreground" aria-hidden="true" />
    <h2 id="not-accessible-title" class="text-base font-semibold tracking-tight">{{ t('notAccessible.title') }}</h2>
    <p class="max-w-prose text-sm text-pretty text-muted-foreground">{{ t('notAccessible.body') }}</p>
    <NuxtLink :to="backTo" class="text-sm font-medium underline underline-offset-4">{{ t(backKey) }}</NuxtLink>
  </section>
</template>
