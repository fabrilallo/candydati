<script setup lang="ts">
import { ExternalLinkIcon, MailCheckIcon, MessageSquareTextIcon, Trash2Icon } from '@lucide/vue'
import type { SourcedContactDto } from '@candydati/domain'
import { safeExternalUrl } from '@/lib/safe-url'
import { daysLeft } from '@/lib/sourcing-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/** One sourced contact: who, from where, what fits the job (evidence, never a score), its state and when it is erased. */
const props = defineProps<{ contact: SourcedContactDto; now: Date; busy: boolean }>()
const emit = defineEmits<{ notice: []; contacted: []; delete: [] }>()
const { t } = useI18n()
const name = computed(() => [props.contact.firstName, props.contact.lastName].filter(Boolean).join(' '))
const days = computed(() => daysLeft(props.contact.expiresAt, props.now))
</script>

<template>
  <li class="grid gap-3 px-5 py-4 sm:px-6" :class="busy ? 'opacity-60' : ''" data-testid="sourced-contact" :data-contact-id="contact.id">
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div class="grid min-w-0 gap-0.5">
        <p class="flex flex-wrap items-center gap-2 font-medium">
          <span data-testid="contact-name">{{ name }}</span>
          <Badge variant="secondary">{{ t(`sourcing.sources.${contact.source}`) }}</Badge>
          <Badge v-if="contact.status !== 'found'" variant="outline" data-testid="contact-status">{{ t(`sourcing.statuses.${contact.status}`) }}</Badge>
        </p>
        <p v-if="contact.headline || contact.location" class="text-sm text-muted-foreground">{{ [contact.headline, contact.location].filter(Boolean).join(' · ') }}</p>
        <a v-if="safeExternalUrl(contact.profileUrl)" :href="safeExternalUrl(contact.profileUrl) ?? undefined" target="_blank" rel="noopener noreferrer nofollow" class="inline-flex w-fit items-center gap-1 text-sm text-link underline-offset-4 hover:underline" data-testid="contact-profile">
          {{ t('sourcing.openProfile') }}<ExternalLinkIcon class="size-3.5" aria-hidden="true" />
        </a>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" :disabled="busy" data-testid="contact-notice" @click="emit('notice')"><MessageSquareTextIcon aria-hidden="true" />{{ t('sourcing.noticeButton') }}</Button>
        <Button v-if="contact.status !== 'contacted'" variant="ghost" size="sm" :disabled="busy" data-testid="contact-contacted" @click="emit('contacted')"><MailCheckIcon aria-hidden="true" />{{ t('sourcing.markContacted') }}</Button>
        <Button variant="ghost" size="icon-sm" :disabled="busy" :aria-label="t('sourcing.deleteFor', { name })" data-testid="contact-delete" @click="emit('delete')"><Trash2Icon aria-hidden="true" /></Button>
      </div>
    </div>
    <ul v-if="contact.evidence.length > 0" class="grid gap-1 text-sm" data-testid="contact-evidence">
      <li v-for="(item, index) in contact.evidence" :key="index"><span class="font-medium">{{ item.criterion }}</span>: {{ item.text }}<span v-if="item.where" class="text-muted-foreground"> ({{ item.where }})</span></li>
    </ul>
    <p class="text-xs text-muted-foreground" data-testid="contact-expiry">{{ t('sourcing.erasedIn', { count: days }, days) }}</p>
  </li>
</template>
