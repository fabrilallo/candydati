<script setup lang="ts">
/** A group of the form. No card: sections are separated by a rule and space (docs/DESIGN-SYSTEM.md, cards only for real hierarchy). */
defineProps<{ id: string; title: string; description?: string | undefined }>()
</script>

<template>
  <section :id="id" :aria-labelledby="`${id}-title`" class="grid scroll-mt-32 gap-5 border-t py-8 first:border-t-0 first:pt-2">
    <div class="grid gap-1">
      <h2 :id="`${id}-title`" class="text-base font-semibold tracking-tight">{{ title }}</h2>
      <p v-if="description" class="text-sm text-pretty text-muted-foreground">{{ description }}</p>
    </div>
    <slot />
  </section>
</template>
