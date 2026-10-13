<script setup lang="ts">
import { CheckIcon, LoaderCircleIcon } from '@lucide/vue'
import type { SaveState } from '@/lib/editor-inputs'

/** Live save state of the ad, announced politely to screen readers. */
defineProps<{ state: SaveState }>()
const { t } = useI18n()
</script>

<template>
  <p role="status" aria-live="polite" class="flex min-h-5 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground" data-testid="save-status">
    <template v-if="state === 'saving'">
      <LoaderCircleIcon class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {{ t('job.editor.workspace.saving') }}
    </template>
    <template v-else-if="state === 'unsaved'">
      <span class="size-1.5 rounded-full bg-warning" aria-hidden="true" />
      <span data-testid="unsaved">{{ t('job.editor.unsaved') }}</span>
    </template>
    <template v-else-if="state === 'saved'">
      <CheckIcon class="size-3.5" aria-hidden="true" />
      {{ t('job.editor.workspace.saved') }}
    </template>
  </p>
</template>
