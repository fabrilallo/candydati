<script setup lang="ts">
/**
 * One focused statistic of the overview: title, the key figure large, the chart, and an optional footer.
 * The `table` slot holds the text alternative of the chart, read by screen readers only.
 */
defineProps<{ id: string; title: string; hint?: string | undefined }>()
</script>

<template>
  <section :aria-labelledby="`${id}-title`" class="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs sm:p-6" :data-testid="id">
    <div class="flex items-start justify-between gap-3">
      <div class="grid min-w-0 gap-0.5">
        <h2 :id="`${id}-title`" class="text-sm font-semibold tracking-tight">{{ title }}</h2>
        <p v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
      </div>
      <slot name="action" />
    </div>
    <slot name="figure" />
    <div class="min-w-0 flex-1">
      <slot />
    </div>
    <slot name="footer" />
    <div class="sr-only"><slot name="table" /></div>
  </section>
</template>
