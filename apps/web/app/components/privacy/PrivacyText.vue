<script setup lang="ts">
import { noticeParagraphs } from '@/lib/consent-copy'

/** A privacy notice as escaped text paragraphs (never HTML): blank lines split paragraphs, single breaks stay. */
const props = defineProps<{ text: string }>()
const paragraphs = computed(() => noticeParagraphs(props.text))
</script>

<template>
  <div class="grid gap-3 text-sm leading-relaxed text-pretty" data-testid="privacy-text">
    <p v-for="(paragraph, index) in paragraphs" :key="index" class="whitespace-pre-line">{{ paragraph }}</p>
  </div>
</template>
