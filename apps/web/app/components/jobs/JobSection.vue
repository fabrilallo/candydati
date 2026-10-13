<script setup lang="ts">
defineProps<{ id: string; title: string; description?: string | undefined }>()
</script>

<template>
  <section :aria-labelledby="`${id}-title`" class="grid gap-4 rounded-xl border bg-card p-5">
    <div class="grid gap-1">
      <h2 :id="`${id}-title`" class="text-base font-semibold">{{ title }}</h2>
      <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
    </div>
    <slot />
  </section>
</template>
