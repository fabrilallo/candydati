<script setup lang="ts">
import type { UIMessage } from 'ai'
import { assistantItems } from '@/lib/assistant-parts'
import type { DraftMessageOutput } from '@/lib/phase6-contract'

/** One turn: the person's words in a bubble, the assistant's as text, steps and draft cards. */
const props = defineProps<{ message: UIMessage }>()
const emit = defineEmits<{ review: [draft: DraftMessageOutput]; applied: [] }>()
const { t } = useI18n()
const items = computed(() => assistantItems(props.message))
const mine = computed(() => props.message.role === 'user')
</script>

<template>
  <li class="grid gap-2.5" :class="mine ? 'justify-items-end' : ''" :data-role="message.role" data-testid="assistant-message">
    <span class="sr-only">{{ mine ? t('assistant.you') : t('assistant.title') }}</span>
    <template v-for="(item, index) in items" :key="index">
      <p v-if="item.kind === 'text' && mine" class="max-w-[85%] rounded-xl rounded-br-sm bg-accent px-3.5 py-2 text-sm whitespace-pre-wrap text-accent-foreground">{{ item.text }}</p>
      <RichText v-else-if="item.kind === 'text'" :text="item.text" />
      <AssistantSteps v-else-if="item.kind === 'steps'" :steps="item.steps" />
      <DraftMessageCard v-else-if="item.kind === 'draft_message'" :id="`draft-${item.id}`" :draft="item.draft" @review="emit('review', $event)" />
      <DraftJobCard v-else-if="item.kind === 'draft_job'" :id="`job-${item.id}`" :draft="item.draft" @apply="emit('applied')" />
    </template>
  </li>
</template>
