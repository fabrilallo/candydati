<script setup lang="ts">
import type { CandidateApplicationDto, ConsentScope  } from '@candydati/domain'
import { formatDate } from '@/lib/format'
import { retentionDaysLeft } from '@/lib/gdpr-view'
import { isToRenew } from '@/lib/import-view'
import { Button } from '@/components/ui/button'

/**
 * Consent per application: notice version and date, scopes, and until when the data are kept with the days left in
 * plain words. Next to each scope "Ritira"; under each application its own erasure, when allowed.
 */
const props = defineProps<{ applications: readonly CandidateApplicationDto[]; talentPool: boolean; now: Date; canWithdraw: boolean; canErase: boolean; busy: boolean }>()
const emit = defineEmits<{ withdraw: [app: CandidateApplicationDto, scope: ConsentScope]; erase: [app: CandidateApplicationDto] }>()
const { t, locale } = useI18n()
const rows = computed(() =>
  props.applications.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map((app) => ({ app, left: retentionDaysLeft(app.retentionExpiresAt, props.now) })),
)
/**
 * A talent pool consent already withdrawn has nothing left to withdraw. Withdrawing `selection` erases the application,
 * so it needs the erase permission too.
 */
const withdrawable = (scope: ConsentScope): boolean =>
  props.canWithdraw && (scope === 'selection' ? props.canErase : props.talentPool)
const toneClass = { neutral: 'text-muted-foreground', warning: 'text-warning font-medium', destructive: 'text-destructive font-medium' } as const
</script>

<template>
  <ul class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="consent-list">
    <li v-for="{ app, left } in rows" :key="app.id" class="grid gap-3 px-5 py-4 sm:px-6" data-testid="consent-item" :data-application-id="app.id">
      <div class="grid gap-0.5">
        <h3 class="text-[0.9375rem] font-medium">{{ app.job.title }}</h3>
        <p v-if="!isToRenew(app) && app.consent.privacyNoticeVersion !== null && app.consent.givenAt" class="figure text-sm text-muted-foreground">{{ t('gdpr.consents.version', { version: app.consent.privacyNoticeVersion, date: formatDate(app.consent.givenAt, locale) }) }}</p>
        <p v-else class="text-sm text-muted-foreground" data-testid="consent-to-renew">{{ t('consentRenew.notGiven') }}</p>
      </div>
      <ul v-if="app.consent.scopes.length > 0" class="flex flex-wrap items-center gap-2" :aria-label="t('gdpr.consents.scopes')">
        <li v-for="scope in app.consent.scopes" :key="scope" class="flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5">
          <span class="text-xs font-medium">{{ t(`candidate.scopes.${scope}`) }}</span>
          <Button
            v-if="withdrawable(scope)"
            variant="ghost"
            size="sm"
            class="h-6 rounded-full px-2 text-xs"
            :disabled="busy"
            :aria-label="t('gdpr.consents.withdrawLabel', { scope: t(`candidate.scopes.${scope}`), job: app.job.title })"
            :data-testid="`withdraw-${scope}`"
            @click="emit('withdraw', app, scope)"
          >{{ t('gdpr.consents.withdraw') }}</Button>
        </li>
      </ul>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p class="figure text-sm" data-testid="consent-retention">
          {{ t('gdpr.consents.retention', { date: formatDate(app.retentionExpiresAt, locale) }) }}<template v-if="left">,
            <span :class="toneClass[left.tone]">{{ t(left.key, { count: left.count }, left.count) }}</span>
          </template>
        </p>
        <Button v-if="canErase" variant="link" size="sm" class="h-auto px-0 text-destructive" :disabled="busy" data-testid="erase-application" @click="emit('erase', app)">{{ t('gdpr.consents.erase') }}</Button>
      </div>
    </li>
  </ul>
</template>
