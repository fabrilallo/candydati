<script setup lang="ts">
import { templateSegments } from '@/lib/template-text'

/**
 * Plain text with its variables marked: unknown ones in the destructive tint so they cannot be missed. Rendered as
 * text nodes only, never as HTML.
 */
const props = defineProps<{ text: string; unknown?: readonly string[] | undefined }>()
const segments = computed(() => templateSegments(props.text, props.unknown))
</script>

<template>
  <span class="whitespace-pre-line">
    <template v-for="(segment, index) in segments" :key="index">
      <mark v-if="segment.kind === 'unknown'" class="rounded bg-destructive-soft px-0.5 font-mono text-[0.8125rem] text-destructive" data-testid="unknown-variable">{{ segment.value }}</mark>
      <span v-else-if="segment.kind === 'known'" class="rounded bg-muted px-0.5 font-mono text-[0.8125rem]">{{ segment.value }}</span>
      <template v-else>{{ segment.value }}</template>
    </template>
  </span>
</template>
