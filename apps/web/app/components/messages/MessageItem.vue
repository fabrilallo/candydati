<script setup lang="ts">
import type { MessageDto } from '@tt/domain'
import { TriangleAlertIcon } from '@lucide/vue'
import { formatDateTime } from '@/lib/format'
import { messageView } from '@/lib/message-view'
import { Badge } from '@/components/ui/badge'

/**
 * One message of a conversation. Ours sit on the right on a neutral tint, the candidate's on the left on the card.
 * Inbound bodies are data written by someone outside: always text interpolation, never HTML.
 */
const props = defineProps<{ message: MessageDto; candidateName: string }>()
const { t, locale } = useI18n()
const view = computed(() => messageView(props.message, props.candidateName))
const author = computed(() => view.value.author ?? t(view.value.authorKey ?? 'messages.system'))
const outbound = computed(() => view.value.side === 'outbound')
</script>

<template>
  <li class="flex gap-3" :class="outbound ? 'justify-end pl-8 sm:pl-16' : 'pr-8 sm:pr-16'" :data-direction="view.side" data-testid="message">
    <PersonAvatar v-if="!outbound" :name="candidateName" />
    <article class="grid min-w-0 gap-2 rounded-xl px-4 py-3" :class="outbound ? 'bg-secondary' : 'border bg-card shadow-xs'">
      <header class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p class="text-sm font-medium" data-testid="message-author">{{ author }}</p>
        <Badge v-if="view.statusKey" :variant="view.tone" data-testid="message-status">{{ t(view.statusKey) }}</Badge>
        <time :datetime="view.at" class="figure text-xs text-muted-foreground">{{ formatDateTime(view.at, locale) }}</time>
      </header>
      <p v-if="view.unverified" class="flex items-start gap-2 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning" role="note" data-testid="message-unverified">
        <TriangleAlertIcon class="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span><span class="font-medium">{{ t('messages.unverified.title') }}</span> {{ t('messages.unverified.body') }}</span>
      </p>
      <p class="text-sm font-medium break-words" data-testid="message-subject">{{ message.subject }}</p>
      <p class="text-sm whitespace-pre-line break-words text-pretty" data-testid="message-body">{{ message.bodyText }}</p>
      <p v-if="view.errorKey" class="text-xs text-destructive" data-testid="message-error">{{ t(view.errorKey) }}</p>
    </article>
  </li>
</template>
