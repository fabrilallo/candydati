<script setup lang="ts">
import type { ShortlistDto } from '@candydati/domain'
import { BanIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { shortlistStatusTone } from '@/lib/shortlist-view'

/** One shortlist sent: to whom, when, until when, and per candidate what was shared and what the client answered. */
const props = defineProps<{ shortlist: ShortlistDto; canRevoke: boolean; revoking: boolean }>()
const emit = defineEmits<{ revoke: [id: string] }>()
const { t, locale } = useI18n()
const confirmOpen = ref(false)
const revocable = computed(() => props.canRevoke && props.shortlist.status === 'open')
const shared = (item: ShortlistDto['items'][number]): string =>
  [t('shortlists.parts.name'), ...(item.shareCv ? [t('shortlists.parts.cv')] : []), ...(item.sharedNoteCount > 0 ? [t('shortlists.parts.notes', { count: item.sharedNoteCount }, item.sharedNoteCount)] : [])].join(', ')
const confirm = (): void => {
  confirmOpen.value = false
  emit('revoke', props.shortlist.id)
}
</script>

<template>
  <article class="grid gap-4 rounded-xl panel px-5 py-5 sm:px-6" data-testid="shortlist-card" :data-status="shortlist.status">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="grid min-w-0 gap-1">
        <h3 class="flex flex-wrap items-center gap-2 text-base font-bold">
          <span class="min-w-0 truncate">{{ t('shortlists.list.to', { name: shortlist.recipientName, email: shortlist.recipientEmail }) }}</span>
          <Badge :variant="shortlistStatusTone(shortlist.status)" data-testid="shortlist-status">{{ t(`shortlists.status.${shortlist.status}`) }}</Badge>
        </h3>
        <p class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span class="figure">{{ t('shortlists.list.sentOn', { date: formatDate(shortlist.createdAt, locale) }) }}</span>
          <span v-if="shortlist.status === 'open'" class="figure">{{ t('shortlists.list.expiresOn', { date: formatDate(shortlist.expiresAt, locale) }) }}</span>
          <span class="figure">{{ shortlist.firstOpenedAt ? t('shortlists.list.opened', { date: formatDate(shortlist.firstOpenedAt, locale) }) : t('shortlists.list.notOpened') }}</span>
        </p>
      </div>
      <Button v-if="revocable" variant="ghost" size="sm" :disabled="revoking" data-testid="shortlist-revoke" @click="confirmOpen = true"><BanIcon aria-hidden="true" />{{ t('shortlists.list.revoke') }}</Button>
    </header>
    <p v-if="shortlist.message" class="rounded-lg bg-muted px-3.5 py-2.5 text-sm text-pretty whitespace-pre-line">{{ shortlist.message }}</p>
    <ul class="divide-y rounded-lg border">
      <li v-for="item in shortlist.items" :key="item.id" class="grid gap-1 px-4 py-3" data-testid="shortlist-item">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-medium">{{ item.candidateName }}</p>
          <Badge v-if="item.answer" :variant="item.answer === 'meet' ? 'success' : 'secondary'" data-testid="shortlist-answer">{{ t(`shortlists.answer.${item.answer}`) }}</Badge>
          <span v-else class="text-xs text-muted-foreground">{{ t('shortlists.item.waiting') }}</span>
        </div>
        <p class="text-xs text-muted-foreground">{{ shared(item) }}</p>
        <p v-if="item.answerReason" class="text-sm text-pretty" data-testid="shortlist-reason">“{{ item.answerReason }}”</p>
        <p v-if="!item.candidateNotified" class="text-xs font-medium text-warning">{{ t('shortlists.item.notNotified') }}</p>
      </li>
    </ul>
    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('shortlists.list.revokeTitle')"
      :body="t('shortlists.list.revokeBody')"
      :confirm-label="t('shortlists.list.revoke')"
      :pending="revoking"
      destructive
      @confirm="confirm"
    />
  </article>
</template>
