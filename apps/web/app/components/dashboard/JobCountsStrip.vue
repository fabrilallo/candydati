<script setup lang="ts">
import { ArrowRightIcon } from '@lucide/vue'
import { JOB_STATUSES } from '@tt/domain'
import type { JobCounts } from '@/lib/job-counts'

/** Totals per status in one panel split in three columns: numbers first, label and meaning below. */
defineProps<{ counts: JobCounts }>()
const { t } = useI18n()
const tone = { draft: 'bg-muted-foreground', published: 'bg-success', closed: 'border border-muted-foreground' } as const
</script>

<template>
  <section aria-labelledby="counts-title" class="rounded-xl border bg-card shadow-xs">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-5 py-3.5 sm:px-6">
      <h2 id="counts-title" class="text-sm font-semibold">{{ t('dashboard.countsLabel') }}</h2>
      <NuxtLink to="/app/jobs" class="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
        {{ t('dashboard.viewAll') }}
        <ArrowRightIcon class="size-4" aria-hidden="true" />
      </NuxtLink>
    </div>
    <dl class="grid grid-cols-3 divide-x">
      <div v-for="status in JOB_STATUSES" :key="status" class="grid content-start gap-1 px-4 py-4 sm:px-6 sm:py-6" :data-testid="`count-${status}`">
        <dt class="flex items-center gap-2 text-xs font-medium sm:text-sm">
          <span class="size-2 shrink-0 rounded-full" :class="tone[status]" aria-hidden="true" />
          {{ t(`dashboard.counts.${status}`) }}
        </dt>
        <dd class="figure text-3xl font-semibold tracking-tight sm:text-5xl" data-testid="count-value">{{ counts[status] }}</dd>
        <dd class="hidden text-sm text-muted-foreground sm:block">{{ t(`dashboard.countsHint.${status}`) }}</dd>
      </div>
    </dl>
  </section>
</template>
