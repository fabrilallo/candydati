<script setup lang="ts">
/** In place of a chart that has nothing to draw yet: what is missing and, when allowed, where to act. */
defineProps<{ title: string; body: string; to?: string | null; cta?: string | undefined }>()
</script>

<template>
  <div class="grid h-full min-h-32 content-center justify-items-start gap-1.5 rounded-lg border border-dashed px-4 py-5" data-testid="chart-empty">
    <p class="text-sm font-medium">{{ title }}</p>
    <p class="max-w-sm text-sm text-muted-foreground">{{ body }}</p>
    <NuxtLink v-if="to && cta" :to="to" class="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline">{{ cta }}</NuxtLink>
  </div>
</template>
