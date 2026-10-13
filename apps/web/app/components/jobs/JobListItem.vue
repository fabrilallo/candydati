<script setup lang="ts">
import type { JobSummaryDto } from '@tt/domain'
import { CheckIcon, CircleAlertIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { jobFacts, readinessOf, relativeTime } from '@/lib/job-list-view'
import { salaryRange } from '@/lib/job-view'
import { formatScore } from '@/lib/quality-view'

const props = withDefaults(defineProps<{ job: JobSummaryDto; now: Date; stale?: boolean; staleDays?: number }>(), { stale: false, staleDays: 0 })
const { t, locale } = useI18n()
const readiness = computed(() => readinessOf(props.job))
const facts = computed(() => jobFacts(props.job))
const meta = computed(() => [facts.value.roleKey ? t(facts.value.roleKey) : t('job.list.noRole'), facts.value.workModeKey ? t(facts.value.workModeKey) : ''].filter((part) => part !== '').join(' · '))
const salary = computed(() => salaryRange(props.job.salary, locale.value))
const score = computed(() => (props.job.qualityTotal === null ? null : formatScore(props.job.qualityTotal, locale.value)))
const updated = computed(() => relativeTime(props.job.updatedAt, props.now, locale.value))
</script>

<template>
  <li
    class="group relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-3 px-5 py-4 transition-colors duration-150 ease-snap hover:bg-muted/60 has-[a:focus-visible]:bg-muted/60 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-inset has-[a:focus-visible]:ring-ring/50 sm:px-6 md:grid-cols-[minmax(0,1fr)_13rem_6.5rem_8.5rem] md:items-center"
    data-testid="job-row"
  >
    <div class="grid min-w-0 gap-0.5">
      <h3 class="text-[0.9375rem] font-medium leading-snug">
        <NuxtLink :to="`/app/jobs/${job.id}`" class="block truncate outline-none after:absolute after:inset-0" data-testid="job-link">{{ job.title || t('job.list.untitled') }}</NuxtLink>
      </h3>
      <p class="truncate text-xs text-muted-foreground">{{ meta }}</p>
    </div>

    <div class="col-span-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 md:contents">
      <div class="min-w-0 text-sm" data-testid="job-publishable" :data-publishable="job.publishable">
        <p v-if="readiness?.kind === 'ready'" class="inline-flex items-center gap-1.5 font-medium text-success">
          <CheckIcon class="size-4" aria-hidden="true" />
          {{ t('job.list.readyToPublish') }}
        </p>
        <p v-else-if="readiness?.kind === 'missing'" class="inline-flex items-center gap-1.5 text-warning">
          <CircleAlertIcon class="size-4" aria-hidden="true" />
          {{ t('job.list.missingItems', { count: readiness.count }, readiness.count) }}
        </p>
        <p v-else-if="salary" :class="['figure font-semibold tracking-tight', job.status === 'closed' ? 'text-muted-foreground' : '']" data-testid="job-salary">{{ salary }}</p>
      </div>

      <div class="flex items-baseline gap-2 md:grid md:justify-items-end md:gap-0">
        <template v-if="score !== null">
          <p class="figure whitespace-nowrap" data-testid="job-quality">
            <span class="sr-only">{{ t('job.list.scoreLabel', { score }) }}</span>
            <span aria-hidden="true"><span class="text-base font-semibold tracking-tight">{{ score }}</span><span class="text-xs text-muted-foreground">/10</span></span>
          </p>
          <p v-if="job.belowThreshold" class="text-xs font-medium text-warning" data-testid="job-below-threshold" :title="t('job.list.belowThresholdLong')">{{ t('job.list.belowThreshold') }}</p>
        </template>
      </div>
    </div>

    <div class="col-start-2 row-start-1 grid justify-items-end gap-1 md:col-start-auto md:row-start-auto">
      <div class="flex flex-wrap justify-end gap-1.5">
        <JobStatusBadge :status="job.status" />
        <Badge v-if="stale" variant="outline" data-testid="job-stale">{{ t('job.list.stale', { count: staleDays }) }}</Badge>
      </div>
      <p class="whitespace-nowrap text-xs text-muted-foreground">
        <time :datetime="job.updatedAt">{{ t('job.list.updatedAgo', { time: updated }) }}</time>
      </p>
    </div>
  </li>
</template>
