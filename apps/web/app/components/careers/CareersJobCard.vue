<script setup lang="ts">
import type { PublicJobSummaryDto } from '@tt/domain'
import { publicJobPath, salaryLine, workLine } from '@/lib/job-view'

defineProps<{ orgSlug: string; job: PublicJobSummaryDto }>()
const { t, locale } = useI18n()
const tr = useVisitorTranslate()
</script>

<template>
  <li>
    <article class="relative grid gap-2 rounded-xl border bg-card p-5 transition-colors focus-within:border-ring hover:border-ring/60" data-testid="careers-job">
      <h2 class="text-lg font-semibold tracking-tight">
        <NuxtLink :to="publicJobPath(orgSlug, job.slug)" class="underline-offset-4 after:absolute after:inset-0 hover:underline" data-testid="careers-job-link">{{ job.title }}</NuxtLink>
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ t(`taxonomy.roles.${job.role}`) }} · {{ t(`taxonomy.seniority.${job.seniority}`) }} · {{ t(`taxonomy.contractTypes.${job.contractType}`) }}
      </p>
      <p class="text-sm">{{ workLine({ workMode: job.workMode, location: job.location }, locale, tr) }}</p>
      <p class="text-sm font-medium" data-testid="careers-salary">{{ salaryLine(job.salary, locale, tr) }}</p>
    </article>
  </li>
</template>
