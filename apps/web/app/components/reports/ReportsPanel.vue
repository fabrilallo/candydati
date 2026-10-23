<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { reportsCsvUrl } from '@/lib/report-api'
import { presetPeriod, type Period } from '@/lib/report-period'
import { isReportEmpty } from '@/lib/report-view'

/**
 * The reports: filters, then a bento of the figures of the period. Period and job live in this component's state
 * (not the URL). Errors never show partial numbers; while refetching the previous figures stay, dimmed.
 */
const { t } = useI18n()
const period = ref<Period>(presetPeriod('last90', new Date()))
const jobId = ref<string | null>(null)
const jobs = useReportJobs()
const { report, errorKey, loading, refresh } = useReports(period, jobId)
const csvUrl = computed(() => reportsCsvUrl(period.value, jobId.value))
const empty = computed(() => report.value !== null && isReportEmpty(report.value))
const SKELETON = ['lg:col-span-7', 'lg:col-span-5', 'lg:col-span-5', 'lg:col-span-7'] as const
</script>

<template>
  <div class="grid gap-6">
    <ReportsFilters v-model:period="period" v-model:job-id="jobId" :jobs="jobs" :csv-url="csvUrl" />
    <div v-if="errorKey" class="grid gap-3" data-testid="reports-error">
      <FormAlert :message-key="errorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="loading && !report" class="grid gap-4" aria-busy="true" data-testid="reports-loading">
      <div class="grid gap-6 rounded-xl panel p-6 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="grid gap-2"><Skeleton class="h-4 w-36" /><Skeleton class="h-9 w-20" /><Skeleton class="h-3 w-28" /></div>
      </div>
      <div class="grid gap-4 lg:grid-cols-12">
        <div v-for="span in SKELETON" :key="span" class="grid gap-4 rounded-xl panel p-6" :class="span">
          <Skeleton class="h-4 w-40" />
          <Skeleton v-for="n in 4" :key="n" class="h-2.5" :style="{ width: `${100 - n * 18}%` }" />
        </div>
      </div>
    </div>
    <template v-else-if="report">
      <div class="grid gap-4" :class="loading ? 'opacity-60 transition-opacity' : ''" :aria-busy="loading || undefined" data-testid="reports">
        <ReportHeadlines :report="report" />
        <p class="text-xs text-muted-foreground" data-testid="reports-small-sample">{{ t('reports.smallSample', { min: report.minSample }) }}</p>
        <div v-if="empty" class="grid justify-items-start gap-1.5 rounded-xl border border-dashed px-6 py-8" data-testid="reports-empty">
          <p class="text-[0.9375rem] font-medium">{{ t('reports.empty.title') }}</p>
          <p class="max-w-prose text-sm text-muted-foreground">{{ t('reports.empty.body') }}</p>
        </div>
        <div v-else class="grid gap-4 lg:grid-cols-12">
          <ReportFunnelCard :funnel="report.funnel" class="lg:col-span-7" />
          <ReportSourcesCard :sources="report.sources" :campaigns="report.campaigns" class="lg:col-span-5" />
          <ReportResponsesCard :responses="report.responses" class="lg:col-span-5" />
          <ReportTimesCard :report="report" class="lg:col-span-7" />
        </div>
      </div>
    </template>
  </div>
</template>
