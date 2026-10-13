<script setup lang="ts">
/** Standard app page header: title (h1), optional description, actions on the right (wrap below on mobile). */
defineProps<{ title: string; description?: string | undefined }>()
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
    <div class="grid min-w-0 gap-1.5">
      <h1 class="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl">{{ title }}</h1>
      <p v-if="description" class="max-w-2xl text-[0.9375rem] text-muted-foreground">{{ description }}</p>
      <slot name="description" />
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
