<script setup lang="ts">
import type { CandidateApplicationDto, CandidateDetailDto } from '@tt/domain'
import { BriefcaseIcon, CalendarClockIcon, LinkIcon, MailIcon, MessageSquareQuoteIcon, PhoneIcon, ShieldCheckIcon } from '@lucide/vue'
import { applicationStatus, retentionState, stageOf } from '@/lib/candidate-view'
import { formatDate } from '@/lib/format'
import { isToRenew } from '@/lib/import-view'
import { stageName } from '@/lib/pipeline-board'
import { Badge } from '@/components/ui/badge'

/** Key and value list of the profile (docs/DESIGN-SYSTEM.md "Elenco chiave e valore"), then what was read from the CV. */
const props = defineProps<{ detail: CandidateDetailDto; current: CandidateApplicationDto | null; now: Date }>()
const { t, locale } = useI18n()
const candidate = computed(() => props.detail.candidate)
const retention = computed(() => retentionState(candidate.value.retentionExpiresAt, props.now))
const showAll = ref(false)
const stageNameOf = (app: CandidateApplicationDto): string => {
  const stage = stageOf(app)
  return stage ? stageName(stage, t) : app.stageRemoved ? t('pipeline.stageRemoved') : ''
}
const rowClass = 'grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4'
const labelClass = 'flex items-center gap-2 text-sm text-muted-foreground'
</script>

<template>
  <div class="grid gap-8">
    <dl class="divide-y" data-testid="candidate-profile">
      <div :class="rowClass">
        <dt :class="labelClass"><MailIcon class="size-4" aria-hidden="true" />{{ t('candidate.fields.email') }}</dt>
        <dd class="min-w-0 text-sm"><a :href="`mailto:${candidate.email}`" class="break-all text-primary underline-offset-4 hover:underline">{{ candidate.email }}</a></dd>
      </div>
      <div :class="rowClass">
        <dt :class="labelClass"><PhoneIcon class="size-4" aria-hidden="true" />{{ t('candidate.fields.phone') }}</dt>
        <dd class="text-sm">
          <a v-if="candidate.phone" :href="`tel:${candidate.phone.replace(/[^+0-9]/g, '')}`" class="figure text-primary underline-offset-4 hover:underline">{{ candidate.phone }}</a>
          <span v-else class="text-muted-foreground">{{ t('candidate.fields.notGiven') }}</span>
        </dd>
      </div>
      <div :class="rowClass">
        <dt :class="labelClass"><LinkIcon class="size-4" aria-hidden="true" />{{ t('candidate.fields.linkedin') }}</dt>
        <dd class="min-w-0 text-sm">
          <a v-if="candidate.linkedinUrl" :href="candidate.linkedinUrl" target="_blank" rel="noopener noreferrer nofollow" class="break-all text-primary underline-offset-4 hover:underline">{{ candidate.linkedinUrl }}</a>
          <span v-else class="text-muted-foreground">{{ t('candidate.fields.notGiven') }}</span>
        </dd>
      </div>
      <div :class="rowClass">
        <dt :class="labelClass"><BriefcaseIcon class="size-4" aria-hidden="true" />{{ t('candidate.fields.applications', { count: detail.applications.length }, detail.applications.length) }}</dt>
        <dd>
          <ul class="grid gap-2">
            <li v-for="app in detail.applications" :key="app.id" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="profile-application">
              <NuxtLink :to="`/app/jobs/${app.job.id}/candidates`" class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-muted">{{ app.job.title }}</NuxtLink>
              <span class="text-muted-foreground">{{ stageNameOf(app) }}</span>
              <Badge :variant="applicationStatus(app).tone">{{ t(applicationStatus(app).key) }}</Badge>
              <ResponsePill :application="app" :now="now" />
              <span class="figure text-xs text-muted-foreground">{{ t('candidate.fields.appliedOn', { date: formatDate(app.createdAt, locale) }) }}</span>
            </li>
          </ul>
        </dd>
      </div>
      <div v-if="current?.message" :class="rowClass">
        <dt :class="labelClass"><MessageSquareQuoteIcon class="size-4" aria-hidden="true" />{{ t('candidate.fields.message') }}</dt>
        <dd class="grid justify-items-start gap-1 text-sm">
          <p class="whitespace-pre-line text-pretty" :class="showAll ? '' : 'line-clamp-3'">{{ current.message }}</p>
          <button v-if="current.message.length > 180" type="button" class="text-sm font-medium text-primary underline-offset-4 hover:underline" @click="showAll = !showAll">{{ showAll ? t('candidate.fields.showLess') : t('candidate.fields.showAll') }}</button>
        </dd>
      </div>
      <div v-if="current" :class="rowClass">
        <dt :class="labelClass"><ShieldCheckIcon class="size-4" aria-hidden="true" />{{ t('candidate.fields.consent') }}</dt>
        <dd class="grid gap-1.5 text-sm" data-testid="profile-consent">
          <p v-if="!isToRenew(current) && current.consent.privacyNoticeVersion !== null && current.consent.givenAt" class="figure">{{ t('candidate.fields.consentVersion', { version: current.consent.privacyNoticeVersion, date: formatDate(current.consent.givenAt, locale) }) }}</p>
          <p v-else class="text-muted-foreground" data-testid="profile-consent-to-renew">{{ t('consentRenew.notGiven') }}</p>
          <ul class="flex flex-wrap gap-1.5">
            <li v-for="scope in current.consent.scopes" :key="scope"><Badge variant="secondary">{{ t(`candidate.scopes.${scope}`) }}</Badge></li>
          </ul>
        </dd>
      </div>
      <div :class="rowClass">
        <dt :class="labelClass"><CalendarClockIcon class="size-4" aria-hidden="true" />{{ t('candidate.fields.retention') }}</dt>
        <dd class="flex flex-wrap items-center gap-2 text-sm" data-testid="profile-retention">
          <span class="figure">{{ t('candidate.fields.retentionUntil', { date: formatDate(candidate.retentionExpiresAt, locale) }) }}</span>
          <Badge v-if="retention !== 'ok'" :variant="retention === 'expired' ? 'destructive' : 'warning'">{{ t(`candidate.retention.${retention}`) }}</Badge>
        </dd>
      </div>
    </dl>
    <CvExtraction v-if="current" :extraction="current.extraction" />
  </div>
</template>
