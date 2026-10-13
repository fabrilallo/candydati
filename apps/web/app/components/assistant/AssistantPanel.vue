<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { BotIcon, RotateCcwIcon, ShieldCheckIcon } from '@lucide/vue'
import { isAssistantShortcut, pageContextOf, suggestionKeys } from '@/lib/page-context'
import type { DraftMessageOutput } from '@/lib/phase6-contract'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

/**
 * The internal assistant: a panel on the right (full screen on a phone), mounted once by the app layout so the
 * conversation survives navigation. Not modal: the page stays usable beside it, so a proposal applied to the
 * editor is visible at once. Every message carries the page in sight. Drafts go to the person's own composer.
 */
const { t } = useI18n()
const route = useRoute()
const assistant = useAssistant()
const page = computed(() => pageContextOf(route, assistant.focus.value))
const chat = useAssistantChat(() => page.value)
const input = ref('')
const composer = ref<{ focus: () => void } | null>(null)
const thread = ref<HTMLElement | null>(null)
const suggestions = computed(() => suggestionKeys(page.value))
const off = computed(() => chat.configured.value === false)

useEventListener(import.meta.client ? window : null, 'keydown', (event: KeyboardEvent) => {
  if (!isAssistantShortcut(event)) return
  event.preventDefault()
  assistant.toggle()
})
watch(assistant.open, (open) => {
  if (open) void chat.checkStatus()
})
/** Another screen (a hiring request) hands the person a message to start from: it lands in the composer, unsent. */
const prefill = useAssistantPrefill()
watch(
  prefill.pending,
  (message) => {
    const text = message === null ? null : prefill.take()
    if (text !== null) input.value = text
  },
  { immediate: true },
)

const scrollToEnd = async (): Promise<void> => {
  await nextTick()
  thread.value?.scrollTo({ top: thread.value.scrollHeight })
}
watch(() => chat.messages.value, scrollToEnd)

const send = (text: string): void => {
  if (chat.send(text)) input.value = ''
}
const reset = async (): Promise<void> => {
  input.value = ''
  await chat.reset()
  composer.value?.focus()
}

/** "Rivedi e invia": the person's composer takes over; the conversation comes back when it closes. */
const reviewing = ref<DraftMessageOutput | null>(null)
const reviewCards = computed(() =>
  reviewing.value ? [{ id: reviewing.value.applicationId, candidate: { firstName: reviewing.value.candidateName ?? t('assistant.draftMessage.thisCandidate'), lastName: '' } }] : [],
)
const review = (draft: DraftMessageOutput): void => {
  reviewing.value = draft
  assistant.open.value = false
}
const reviewed = (): void => {
  reviewing.value = null
  assistant.open.value = true
}
const keepOpen = (event: Event): void => event.preventDefault()
const focusInput = (event: Event): void => {
  event.preventDefault()
  composer.value?.focus()
}
</script>

<template>
  <Sheet v-model:open="assistant.open.value" :modal="false">
    <SheetContent
      side="right"
      class="w-full gap-0 bg-background p-0 sm:w-[min(28rem,calc(100%-3rem))]"
      data-testid="assistant-panel"
      @interact-outside="keepOpen"
      @open-auto-focus="focusInput"
    >
      <header class="flex items-start gap-3 border-b px-5 py-3.5 pr-14">
        <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true"><BotIcon class="size-4" /></span>
        <div class="grid min-w-0 flex-1">
          <SheetTitle class="text-sm font-semibold">{{ t('assistant.title') }}</SheetTitle>
          <SheetDescription class="truncate text-xs text-muted-foreground" data-testid="assistant-page">{{ t('assistant.lookingAt', { page: t(`assistant.views.${page.view}`) }) }}</SheetDescription>
        </div>
        <Button v-if="chat.messages.value.length > 0" variant="ghost" size="icon-sm" class="-my-0.5" :aria-label="t('assistant.reset')" :title="t('assistant.reset')" data-testid="assistant-reset" @click="reset"><RotateCcwIcon aria-hidden="true" /></Button>
      </header>
      <p class="flex items-center gap-2 border-b bg-muted/50 px-5 py-2 text-xs text-muted-foreground" data-testid="assistant-promise">
        <ShieldCheckIcon class="size-3.5 shrink-0" aria-hidden="true" />{{ t('assistant.promise') }}
      </p>
      <div ref="thread" class="flex-1 overflow-y-auto px-5 py-5" aria-live="polite" :aria-busy="chat.busy.value">
        <AssistantNotConfigured v-if="off" />
        <AssistantEmpty v-else-if="chat.messages.value.length === 0" :suggestions="suggestions" :disabled="chat.busy.value" @pick="send" />
        <ol v-else class="grid gap-6" :aria-label="t('assistant.conversation')">
          <AssistantMessage v-for="message in chat.messages.value" :key="message.id" :message="message" @review="review" />
        </ol>
        <p v-if="chat.status.value === 'submitted'" class="mt-4 text-xs text-muted-foreground" data-testid="assistant-thinking">{{ t('assistant.thinking') }}</p>
        <div v-if="chat.error.value" class="mt-4 grid gap-2" data-testid="assistant-error">
          <FormAlert message-key="assistant.error" />
          <div><Button variant="outline" size="sm" @click="() => chat.retry()">{{ t('common.retry') }}</Button></div>
        </div>
      </div>
      <div class="border-t px-4 py-3">
        <AssistantComposer ref="composer" v-model="input" :busy="chat.busy.value" :disabled="off" @send="send" @stop="() => chat.stop()" />
      </div>
    </SheetContent>
  </Sheet>
  <BulkComposerSheet :cards="reviewCards" :draft="reviewing" @close="reviewed" @sent="reviewed" />
</template>
