<script setup lang="ts">
import type { ScorecardRowDto } from '@candydati/domain'
import { formatDate } from '@/lib/format'

/**
 * The scorecard of an application (PRODUCT.md §2.4): one row per criterion, in the job's order, with each
 * interviewer's word and evidence side by side (stacked on a phone). No count, no total, no ordering of people: the
 * person who decides reads the evidence.
 */
defineProps<{ rows: readonly ScorecardRowDto[]; stageName: (stageId: string, label: string) => string }>()
const { t, locale } = useI18n()
</script>

<template>
  <section class="grid gap-3" aria-labelledby="scorecard-title" data-testid="scorecard">
    <div class="grid gap-0.5">
      <h4 id="scorecard-title" class="text-sm font-semibold">{{ t('feedback.tab.scorecard.title') }}</h4>
      <p class="text-xs text-pretty text-muted-foreground">{{ t('feedback.tab.scorecard.note') }}</p>
    </div>
    <ul class="grid gap-3">
      <li v-for="row in rows" :key="row.criterionId" class="grid gap-3 rounded-xl panel p-4 lg:grid-cols-[12rem_minmax(0,1fr)]" data-testid="scorecard-row">
        <h5 class="text-[0.9375rem] font-semibold text-pretty" data-testid="scorecard-criterion">{{ row.label }}</h5>
        <p v-if="row.entries.length === 0" class="text-sm text-muted-foreground" data-testid="scorecard-none">{{ t('feedback.tab.scorecard.none') }}</p>
        <ul v-else class="grid gap-2 sm:grid-cols-2">
          <li v-for="entry in row.entries" :key="entry.feedbackId" class="grid content-start gap-1.5 rounded-lg border bg-card px-3 py-2.5" data-testid="scorecard-entry">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium">{{ entry.interviewerName }}</p>
              <ObservationPill :observation="entry.observation" />
            </div>
            <p class="figure text-xs text-muted-foreground">{{ t('feedback.tab.scorecard.at', { stage: stageName(entry.stageId, entry.stageLabel), date: formatDate(entry.submittedAt, locale) }) }}</p>
            <p class="text-sm text-pretty whitespace-pre-line">{{ entry.evidence }}</p>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
