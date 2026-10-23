<script setup lang="ts">
import { SendIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/** Sticky at the bottom of the board while something is selected: how many, write to them, or clear. */
defineProps<{ count: number }>()
const emit = defineEmits<{ message: []; clear: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="pointer-events-none sticky bottom-4 z-30 flex justify-center" data-testid="selection-bar">
    <div role="region" :aria-label="t('pipeline.selection.bar')" class="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border-2 border-ink bg-popover py-2 pr-2 pl-4 shadow-hard">
      <p class="text-sm font-medium" aria-live="polite" data-testid="selection-count">{{ t('pipeline.selection.count', { count }, count) }}</p>
      <Button size="sm" data-testid="selection-message" @click="emit('message')"><SendIcon aria-hidden="true" />{{ t('pipeline.selection.message') }}</Button>
      <Button size="sm" variant="ghost" data-testid="selection-clear" @click="emit('clear')"><XIcon aria-hidden="true" />{{ t('pipeline.selection.clear') }}</Button>
    </div>
  </div>
</template>
