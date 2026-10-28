<script setup lang="ts">
import { ArrowRightIcon, UsersRoundIcon } from '@lucide/vue'
import { Skeleton } from '@/components/ui/skeleton'
import { presetPeriod } from '@/lib/report-period'

/**
 * The candidate figures of the last 30 days, the same ones the reports page heads with, and the way to the full
 * reports. Shown only to whoever may read the reports; a failure says so instead of showing numbers.
 */
const { t } = useI18n()
const period = ref(presetPeriod('last30', new Date()))
const { report, errorKey, loading } = useReports(period, ref(null), 'dashboard-reports')
</script>

<template>
  <section aria-labelledby="candidate-metrics-title" class="grid gap-4" data-testid="candidate-metrics">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2.5">
        <span class="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true"><UsersRoundIcon class="size-4" /></span>
        <h2 id="candidate-metrics-title" class="text-sm font-semibold tracking-tight">{{ t('dashboard.stats.candidates.title') }}</h2>
      </div>
      <NuxtLink to="/app/reports" class="flex items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline" data-testid="candidate-metrics-reports">
        {{ t('dashboard.stats.candidates.open') }}
        <ArrowRightIcon class="size-4" aria-hidden="true" />
      </NuxtLink>
    </div>
    <FormAlert v-if="errorKey" :message-key="errorKey" />
    <ReportHeadlines v-else-if="report" :report="report" />
    <Skeleton v-else-if="loading" class="h-36 w-full rounded-xl" />
  </section>
</template>
