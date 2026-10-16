<script setup lang="ts">
import type { MigrationJobCountDto } from '@candydati/domain'
import { Badge } from '@/components/ui/badge'

/** The jobs of the package with their applications by outcome. Left out jobs stay listed, marked. */
defineProps<{ jobs: readonly { readonly count: MigrationJobCountDto; readonly excluded: boolean }[] }>()
const { t } = useI18n()
const OUTCOMES = ['open', 'hired', 'notSelected', 'withdrawn'] as const
</script>

<template>
  <section class="grid gap-3" aria-labelledby="migration-jobs-title" data-testid="migration-jobs">
    <h3 id="migration-jobs-title" class="text-base font-semibold tracking-tight">{{ t('migrations.preview.jobsTitle') }}</h3>
    <ul class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
      <li v-for="job in jobs" :key="job.count.jobRef" class="grid gap-1 px-5 py-3.5 sm:px-6" :data-job="job.count.jobRef" :data-excluded="job.excluded">
        <p class="flex flex-wrap items-center gap-2">
          <span class="text-[0.9375rem] font-medium">{{ job.count.title }}</span>
          <Badge variant="outline">{{ t(`migrations.preview.jobs.status.${job.count.status}`) }}</Badge>
          <Badge v-if="job.excluded" variant="secondary">{{ t('migrations.preview.jobs.leftOutPill') }}</Badge>
        </p>
        <p class="figure flex flex-wrap gap-x-2.5 gap-y-1 text-sm text-muted-foreground [&>*+*]:before:mr-2.5 [&>*+*]:before:text-input [&>*+*]:before:content-['|']">
          <span class="font-medium text-foreground">{{ t('migrations.preview.jobs.applications', { count: job.count.applications }, job.count.applications) }}</span>
          <span>{{ t('migrations.preview.jobs.stages', { count: job.count.stages }, job.count.stages) }}</span>
          <template v-for="outcome in OUTCOMES" :key="outcome">
            <span v-if="job.count[outcome] > 0">{{ t(`migrations.preview.jobs.${outcome}`, { count: job.count[outcome] }) }}</span>
          </template>
        </p>
      </li>
    </ul>
  </section>
</template>
