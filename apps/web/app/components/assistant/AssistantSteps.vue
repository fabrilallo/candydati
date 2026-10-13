<script setup lang="ts">
import { CheckIcon, CircleAlertIcon, LoaderCircleIcon } from '@lucide/vue'
import { stepLabelKey, type Step } from '@/lib/assistant-parts'

/** What the assistant did, one compact line per tool call ("Ho letto l'annuncio"). */
defineProps<{ steps: readonly Step[] }>()
const { t } = useI18n()
</script>

<template>
  <ul class="grid gap-1" data-testid="assistant-steps">
    <li v-for="step in steps" :key="step.id" class="flex items-center gap-2 text-xs text-muted-foreground" :data-state="step.state">
      <LoaderCircleIcon v-if="step.state === 'running'" class="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <CircleAlertIcon v-else-if="step.state === 'failed'" class="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
      <CheckIcon v-else class="size-3.5 shrink-0" aria-hidden="true" />
      <span>{{ t(stepLabelKey(step)) }}</span>
    </li>
  </ul>
</template>
