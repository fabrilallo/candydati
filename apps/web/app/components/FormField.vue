<script setup lang="ts">
import { Label } from '@/components/ui/label'

defineProps<{ id: string; label: string; error?: string | undefined; hint?: string | undefined }>()
const { t } = useI18n()
</script>

<template>
  <div class="grid gap-1.5">
    <Label :for="id">{{ label }}</Label>
    <slot :invalid="Boolean(error)" :described-by="error ? `${id}-error` : hint ? `${id}-hint` : undefined" />
    <p v-if="hint && !error" :id="`${id}-hint`" class="text-xs text-muted-foreground">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" role="alert" class="text-xs font-medium text-destructive">{{ t(error) }}</p>
  </div>
</template>
