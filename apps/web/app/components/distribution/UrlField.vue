<script setup lang="ts">
/** A public address with its copy button and a short hint. */
defineProps<{ label: string; url: string; copyLabel: string; hint?: string; testId: string }>()
</script>

<template>
  <div class="grid gap-2">
    <p class="text-sm font-medium">{{ label }}</p>
    <div class="flex min-w-0 items-center gap-2">
      <code class="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm" :data-testid="testId">{{ url }}</code>
      <CopyButton :text="url" :label="copyLabel" />
    </div>
    <p v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
  </div>
</template>
