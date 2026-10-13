<script setup lang="ts">
import { ArrowUpRightIcon } from '@lucide/vue'
import type { SuggestionKey } from '@/lib/page-context'

/** First thing in an empty conversation: what the assistant does, and starting points that fit the page. */
defineProps<{ suggestions: readonly SuggestionKey[]; disabled: boolean }>()
const emit = defineEmits<{ pick: [text: string] }>()
const { t } = useI18n()
</script>

<template>
  <div class="grid gap-5" data-testid="assistant-empty">
    <div class="grid gap-1.5">
      <p class="text-[0.9375rem] font-medium">{{ t('assistant.empty.title') }}</p>
      <p class="text-sm text-muted-foreground text-pretty">{{ t('assistant.empty.body') }}</p>
    </div>
    <ul class="grid gap-2" :aria-label="t('assistant.empty.suggestions')">
      <li v-for="key in suggestions" :key="key">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-3.5 py-2.5 text-left text-sm transition-colors duration-150 ease-snap hover:border-input hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          :disabled="disabled"
          :data-testid="`assistant-suggestion-${key}`"
          @click="emit('pick', t(`assistant.suggestions.${key}`))"
        >
          <span>{{ t(`assistant.suggestions.${key}`) }}</span>
          <ArrowUpRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </div>
</template>
