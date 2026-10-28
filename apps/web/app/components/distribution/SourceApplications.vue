<script setup lang="ts">
import type { ApplicationCardDto, PipelineDto } from '@candydati/domain'
import { fullName } from '@/lib/candidate-view'
import { formatDate } from '@/lib/format'
import { stageName } from '@/lib/pipeline-board'
import { matchesSource, type SourceFilter } from '@/lib/traffic-view'

/**
 * Who applied through one source or saved link: name, date and where the application stands, each linking to the
 * profile. The applications are the job's pipeline, so the list shows exactly the people the board shows this viewer.
 * Newest first, all time (not only the chart's period).
 */
const props = defineProps<{ pipeline: PipelineDto; filter: SourceFilter | null; jobId: string }>()
const { t, locale } = useI18n()
const rows = computed(() =>
  props.pipeline.applications.filter((card) => matchesSource(card, props.filter)).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)),
)
const where = (card: ApplicationCardDto): string => {
  if (card.outcome !== null) return t(`candidate.outcomes.${card.outcome}`)
  const stage = props.pipeline.stages.find((candidate) => candidate.id === card.stageId)
  return stage ? stageName(stage, t) : t('pipeline.stageRemoved')
}
const profile = (card: ApplicationCardDto): string => `/app/candidates/${encodeURIComponent(card.candidate.id)}?application=${encodeURIComponent(card.id)}&viaJobId=${encodeURIComponent(props.jobId)}`
</script>

<template>
  <div class="grid gap-2" data-testid="source-applications">
    <p v-if="rows.length === 0" class="text-sm text-muted-foreground" data-testid="source-applications-none">{{ t('trackedLinks.people.none') }}</p>
    <ul v-else class="divide-y rounded-lg border">
      <li v-for="card in rows" :key="card.id" class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm" data-testid="source-application">
        <NuxtLink :to="profile(card)" class="min-w-0 truncate font-medium text-link underline-offset-4 hover:underline">{{ fullName(card.candidate) }}</NuxtLink>
        <span class="figure text-xs text-muted-foreground">
          {{ t('trackedLinks.people.applied', { date: formatDate(card.createdAt, locale) }) }} · {{ where(card) }}
        </span>
      </li>
    </ul>
  </div>
</template>
