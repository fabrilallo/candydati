<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { presetPeriod, type Period } from '@/lib/report-period'

/** Visits, applications and conversion per source and campaign for this ad only, the last 90 days: the same card as the reports. */
const props = defineProps<{ jobId: string }>()
const { t } = useI18n()
const period = ref<Period>(presetPeriod('last90', new Date()))
const jobId = computed(() => props.jobId)
const { report, errorKey, loading, refresh } = useReports(period, jobId, `job-sources-${props.jobId}`)
</script>

<template>
  <section class="grid gap-3" aria-labelledby="job-sources-title" data-testid="job-sources">
    <div class="grid gap-1">
      <h2 id="job-sources-title" class="text-base font-semibold tracking-tight">{{ t('trackedLinks.visits.title') }}</h2>
      <p class="text-sm text-muted-foreground">{{ t('trackedLinks.visits.description') }}</p>
    </div>
    <div v-if="errorKey" class="grid gap-3" data-testid="job-sources-error">
      <FormAlert :message-key="errorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="loading && !report" class="h-40 w-full" aria-busy="true" />
    <ReportSourcesCard v-else-if="report" :sources="report.sources" :campaigns="report.campaigns" />
  </section>
</template>
