<script setup lang="ts">
import { RETENTION_WARNING_DAYS } from '@candydati/domain'
import { retentionCopy } from '@/lib/consent-copy'
import { formatDate, formatDateTime } from '@/lib/format'
import { retentionDaysLeft, sortUpcoming } from '@/lib/gdpr-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * How retention works with the organization's periods, the expiries of the next 30 days and the last runs of the
 * automatic deletion. Names are shown: this page is for owners and admins only.
 */
const { t, locale } = useI18n()
const trText = useAdText(locale)
const retention = useRetentionOverview()
const state = computed(() => retention.state.value)
const periods = computed(() => (state.value?.retentionDays ? retentionCopy(state.value.retentionDays, (key, params) => trText.value(key, params)) : null))
const now = ref(new Date())
const upcoming = computed(() => (state.value ? sortUpcoming(state.value.overview.upcoming).map((item) => ({ item, left: retentionDaysLeft(item.retentionExpiresAt, now.value) })) : []))
const runs = computed(() => (state.value ? state.value.overview.lastRuns.toSorted((a, b) => b.startedAt.localeCompare(a.startedAt)) : []))
const toneClass = { neutral: 'text-muted-foreground', warning: 'text-warning', destructive: 'text-destructive' } as const
const link = (candidateId: string, applicationId: string): string => `/app/candidates/${encodeURIComponent(candidateId)}?application=${encodeURIComponent(applicationId)}`
</script>

<template>
  <section class="grid gap-5" aria-labelledby="retention-title" data-testid="retention-overview">
    <div class="grid gap-1.5">
      <h2 id="retention-title" class="text-lg font-semibold tracking-tight">{{ t('retention.title') }}</h2>
      <p v-if="state" class="max-w-3xl text-sm text-pretty text-muted-foreground" data-testid="retention-explain">
        {{ periods ? t('retention.explain', { selection: periods.selection, pool: periods.talentPool, days: RETENTION_WARNING_DAYS }) : t('retention.explainNoNotice', { days: RETENTION_WARNING_DAYS }) }}
      </p>
    </div>
    <div v-if="retention.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="retention.errorKey.value" />
      <div><Button variant="outline" @click="() => retention.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!state" class="grid gap-3" aria-busy="true"><Skeleton class="h-4 w-2/3" /><Skeleton class="h-32 w-full rounded-xl" /></div>
    <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div class="grid content-start gap-3">
        <h3 class="text-base font-semibold tracking-tight">{{ t('retention.upcomingTitle', { days: RETENTION_WARNING_DAYS }) }}</h3>
        <p v-if="upcoming.length === 0" class="rounded-xl border border-dashed border-input px-5 py-5 text-sm text-muted-foreground" data-testid="retention-upcoming-empty">
          {{ t('retention.upcomingEmpty', { days: RETENTION_WARNING_DAYS }) }}
        </p>
        <ul v-else class="divide-y overflow-hidden rounded-xl panel shadow-xs" data-testid="retention-upcoming">
          <li v-for="{ item, left } in upcoming" :key="item.applicationId" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5" data-testid="retention-item">
            <div class="grid min-w-0 gap-0.5">
              <NuxtLink :to="link(item.candidateId, item.applicationId)" class="truncate text-sm font-medium underline-offset-4 hover:underline">{{ item.candidateName ?? t('retention.unnamed') }}</NuxtLink>
              <span class="truncate text-sm text-muted-foreground">{{ item.jobTitle }}</span>
            </div>
            <div class="grid justify-items-end gap-0.5 text-right">
              <time class="figure text-sm" :datetime="item.retentionExpiresAt">{{ formatDate(item.retentionExpiresAt, locale) }}</time>
              <span v-if="left" class="figure text-xs font-medium" :class="toneClass[left.tone]">{{ t(left.key, { count: left.count }, left.count) }}</span>
            </div>
          </li>
        </ul>
      </div>
      <div class="grid content-start gap-3">
        <h3 class="text-base font-semibold tracking-tight">{{ t('retention.runsTitle') }}</h3>
        <p v-if="runs.length === 0" class="rounded-xl border border-dashed border-input px-5 py-5 text-sm text-muted-foreground" data-testid="retention-runs-empty">{{ t('retention.runsEmpty') }}</p>
        <ul v-else class="divide-y overflow-hidden rounded-xl panel shadow-xs" data-testid="retention-runs">
          <li v-for="run in runs" :key="run.id" class="grid gap-0.5 px-5 py-3.5" data-testid="retention-run">
            <time class="figure text-sm font-medium" :datetime="run.startedAt">{{ formatDateTime(run.startedAt, locale) }}</time>
            <span class="figure text-sm text-muted-foreground">{{ t('retention.warned', { count: run.warned }, run.warned) }}, {{ t('retention.erased', { count: run.erased }, run.erased) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
