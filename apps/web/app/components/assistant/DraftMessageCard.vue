<script setup lang="ts">
import { MailIcon, SendIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'
import type { DraftMessageOutput } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/**
 * A message the assistant drafted for one application. Editable here; "Rivedi e invia" opens the usual composer
 * with this text, where the person previews and sends. The assistant never sends.
 */
const props = defineProps<{ draft: DraftMessageOutput; id: string }>()
const emit = defineEmits<{ review: [draft: DraftMessageOutput] }>()
const { t } = useI18n()
const { viewer } = useViewer()
const subject = ref(props.draft.subject)
const body = ref(props.draft.body)
const canSend = computed(() => can(viewer.value?.role ?? null, 'message:send'))
const recipient = computed(() => t('assistant.draftMessage.thisCandidate'))
const review = (): void => emit('review', { ...props.draft, subject: subject.value, body: body.value })
</script>

<template>
  <section class="grid gap-3 rounded-lg border bg-card p-4 shadow-xs" :aria-labelledby="`${id}-title`" data-testid="draft-message-card">
    <p :id="`${id}-title`" class="flex items-center gap-2 text-sm font-medium">
      <MailIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('assistant.draftMessage.title', { name: recipient }) }}
    </p>
    <div class="grid gap-1.5">
      <Label :for="`${id}-subject`" class="text-xs">{{ t('messages.composer.subject') }}</Label>
      <Input :id="`${id}-subject`" v-model="subject" data-testid="draft-subject" />
    </div>
    <div class="grid gap-1.5">
      <Label :for="`${id}-body`" class="text-xs">{{ t('messages.composer.body') }}</Label>
      <Textarea :id="`${id}-body`" v-model="body" rows="6" class="text-sm" data-testid="draft-body" />
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">{{ canSend ? t('assistant.draftMessage.youSend') : t('assistant.draftMessage.cannotSend') }}</p>
      <Button v-if="canSend" size="sm" :disabled="subject.trim() === '' || body.trim() === ''" data-testid="draft-review" @click="review"><SendIcon aria-hidden="true" />{{ t('assistant.draftMessage.review') }}</Button>
    </div>
  </section>
</template>
