<script setup lang="ts">
import type { PublicJobSummaryDto } from '@tt/domain'
import { ArrowRightIcon, ListChecksIcon } from '@lucide/vue'
import { placeLine, publicJobPath, salaryRange } from '@/lib/job-view'

const props = defineProps<{ orgSlug: string; job: PublicJobSummaryDto }>()
const { t, locale } = useI18n()
const salary = computed(() => salaryRange(props.job.salary, locale.value))
const quiet = computed(() =>
  [
    t(`taxonomy.roles.${props.job.role}`),
    t(`taxonomy.seniority.${props.job.seniority}`),
    t(`taxonomy.contractTypes.${props.job.contractType}`),
    t(`taxonomy.workModes.${props.job.workMode}`),
    placeLine({ workMode: props.job.workMode, location: props.job.location }, locale.value),
  ]
    .filter((part) => part !== '')
    .join(' · '),
)
</script>

<template>
  <li>
    <article
      class="group relative -mx-4 grid gap-x-8 gap-y-3 rounded-xl px-4 py-5 transition-[background-color,box-shadow] duration-150 ease-snap hover:bg-card hover:shadow-xs active:bg-muted has-[a:focus-visible]:bg-card has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50 @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:items-start"
      data-testid="careers-job"
    >
      <div class="grid min-w-0 gap-1.5">
        <h4 class="text-xl font-semibold leading-snug tracking-tight">
          <NuxtLink :to="publicJobPath(orgSlug, job.slug)" class="outline-none transition-colors duration-150 after:absolute after:inset-0 group-hover:text-primary" data-testid="careers-job-link">{{ job.title }}</NuxtLink>
          <ArrowRightIcon class="ml-1.5 inline size-4 -translate-x-1 align-[-0.1em] text-primary opacity-0 transition-[opacity,transform] duration-150 ease-snap group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none" aria-hidden="true" />
        </h4>
        <p class="text-sm text-muted-foreground">{{ quiet }}</p>
      </div>
      <div class="grid gap-2 @2xl:justify-items-end @2xl:text-right">
        <p class="grid gap-0.5">
          <span class="figure text-2xl font-semibold leading-none tracking-tighter" data-testid="careers-salary">{{ salary }}</span>
          <span class="text-xs text-muted-foreground">{{ t(`taxonomy.salaryPeriodsGross.${job.salary.period}`) }}</span>
        </p>
        <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium @2xl:justify-end" data-testid="careers-process">
          <span class="inline-flex items-center gap-1.5"><ListChecksIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('careers.job.stages', { count: job.stageCount }, job.stageCount) }}</span>
        </p>
      </div>
    </article>
  </li>
</template>
