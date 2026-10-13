<script setup lang="ts">
import { Label } from '@/components/ui/label'

/**
 * Label above, control, help below, error in place of the help (docs/DESIGN.md "Form"). Texts arrive already
 * translated: the public form reads in the language of the ad, not of the visitor.
 */
defineProps<{ id: string; label: string; optional?: string | undefined; hint?: string | undefined; error?: string | undefined }>()
</script>

<template>
  <div class="grid content-start gap-1.5">
    <Label :for="id">{{ label }}<span v-if="optional" class="font-normal text-muted-foreground">{{ optional }}</span></Label>
    <slot :invalid="Boolean(error)" :described-by="error ? `${id}-error` : hint ? `${id}-hint` : undefined" />
    <p v-if="hint && !error" :id="`${id}-hint`" class="text-xs text-muted-foreground">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="text-xs font-medium text-destructive" data-testid="field-error">{{ error }}</p>
  </div>
</template>
