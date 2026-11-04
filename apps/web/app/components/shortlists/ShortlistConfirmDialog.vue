<script setup lang="ts">
import { SHORTLIST_TOKEN_TTL_DAYS, type ClientDisplay } from '@candydati/domain'
import { LoaderCircleIcon, MailIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogScrollContent, DialogTitle } from '@/components/ui/dialog'
import type { ConfirmLine, ShortlistIssue } from '@/lib/shortlist-view'

/**
 * The last step before a shortlist goes out: who receives it, what the client sees of each candidate, and that every
 * candidate is told (by name of the client, or "a client of the agency" when the ad is confidential).
 */
const props = defineProps<{
  open: boolean
  clientName: string
  display: ClientDisplay
  recipient: { readonly name: string; readonly email: string } | null
  lines: readonly ConfirmLine[]
  pending: boolean
  errorKey: string | null
  issues: readonly ShortlistIssue[]
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [] }>()
const { t } = useI18n()
const parts = (line: ConfirmLine): string =>
  [t('shortlists.parts.name'), ...(line.shareCv ? [t('shortlists.parts.cv')] : []), ...(line.noteCount > 0 ? [t('shortlists.parts.notes', { count: line.noteCount }, line.noteCount)] : [])].join(', ')
const noticeKey = computed(() => (props.display === 'confidential' ? 'shortlists.confirm.notice.confidential' : 'shortlists.confirm.notice.named'))
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogScrollContent class="sm:max-w-lg" data-testid="shortlist-confirm">
      <DialogHeader>
        <DialogTitle>{{ t('shortlists.confirm.title') }}</DialogTitle>
        <DialogDescription v-if="recipient" data-testid="shortlist-confirm-recipient">
          {{ t('shortlists.confirm.to', { name: recipient.name, client: clientName, email: recipient.email, days: SHORTLIST_TOKEN_TTL_DAYS }) }}
        </DialogDescription>
      </DialogHeader>
      <section class="grid gap-2" aria-labelledby="shortlist-confirm-what">
        <h3 id="shortlist-confirm-what" class="text-sm font-semibold">{{ t('shortlists.confirm.whatGoes') }}</h3>
        <ul class="divide-y rounded-lg border text-sm">
          <li v-for="line in lines" :key="line.applicationId" class="grid gap-0.5 px-3.5 py-2.5" data-testid="shortlist-confirm-line">
            <span class="font-medium">{{ line.name }}</span>
            <span class="text-xs text-muted-foreground">{{ parts(line) }}</span>
          </li>
        </ul>
        <p class="text-xs text-muted-foreground">{{ t('shortlists.confirm.noContact') }}</p>
      </section>
      <p class="flex items-start gap-2 rounded-lg border-2 border-ink bg-accent px-3.5 py-3 text-sm text-pretty text-accent-foreground" data-testid="shortlist-confirm-notice">
        <MailIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t(noticeKey, { client: clientName }) }}
      </p>
      <p class="text-sm text-pretty text-muted-foreground">{{ t('shortlists.confirm.decides') }}</p>
      <div v-if="errorKey || issues.length > 0" role="alert" class="grid gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="shortlist-confirm-errors">
        <p v-if="errorKey">{{ t(errorKey) }}</p>
        <ul v-if="issues.length > 0" class="grid gap-0.5">
          <li v-for="(issue, index) in issues" :key="index">{{ t(issue.key, { name: issue.name }) }}</li>
        </ul>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('shortlists.confirm.back') }}</Button>
        <Button type="button" :disabled="pending" data-testid="shortlist-send" @click="emit('confirm')">
          <LoaderCircleIcon v-if="pending" class="animate-spin" aria-hidden="true" />{{ pending ? t('shortlists.confirm.sending') : t('shortlists.confirm.send') }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
