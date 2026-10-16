<script setup lang="ts">
import type { MigrationBatchDto } from '@candydati/domain'
import { ISSUE_LEVELS, issueTotals, jobViews, previewFigures } from '@/lib/migration-view'
import { Button } from '@/components/ui/button'

/**
 * Step 4 "Preview": nothing is written yet. The figures, the consent breakdown of the people, the jobs with their
 * outcomes and the findings of the analysis in plain language. Errors are shown first: the confirmation is refused while one stands.
 */
const props = defineProps<{ batch: MigrationBatchDto }>()
const emit = defineEmits<{ next: [] }>()
const { t } = useI18n()
const figures = computed(() => previewFigures(props.batch))
const totals = computed(() => issueTotals(props.batch.counts))
// The commit looks the errors up again when it is asked for (a notice published since still counts): the way on stays open.
const blocked = computed(() => totals.value.error > 0)
const levels = computed(() => ISSUE_LEVELS.filter((level) => totals.value[level] > 0))
const stats = computed(() => (['jobs', 'candidates', 'applications', 'notes', 'messages', 'files'] as const).map((key) => ({ key, value: figures.value[key] })))
</script>

<template>
  <section class="grid gap-8" aria-labelledby="migration-preview-title" data-testid="migration-preview-step">
    <MigrationBetaNotice v-if="batch.connectorMaturity === 'beta'" :source="batch.sourceSystem" />

    <div class="grid gap-1">
      <h2 id="migration-preview-title" class="text-lg font-semibold tracking-tight">{{ t('migrations.preview.title') }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.preview.intro') }}</p>
    </div>

    <div class="grid gap-2">
      <dl class="grid grid-cols-2 divide-x divide-y overflow-hidden rounded-xl border bg-card shadow-xs sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6" data-testid="migration-figures">
        <div v-for="stat in stats" :key="stat.key" class="grid gap-1 px-5 py-4 sm:px-6" :data-figure="stat.key">
          <dt class="text-xs text-muted-foreground">{{ t(`migrations.preview.figures.${stat.key}`) }}</dt>
          <dd class="figure text-2xl font-semibold tracking-tight">{{ stat.value }}</dd>
        </div>
      </dl>
      <p v-if="figures.jobsLeftOut > 0" class="text-sm text-muted-foreground" data-testid="migration-left-out">{{ t('migrations.preview.leftOut', { count: figures.jobsLeftOut }, figures.jobsLeftOut) }}</p>
    </div>

    <MigrationConsentSummary :counts="batch.counts" />
    <MigrationJobCounts :jobs="jobViews(batch)" />

    <section class="grid gap-3" aria-labelledby="migration-issues-title" data-testid="migration-issues">
      <h3 id="migration-issues-title" class="text-base font-semibold tracking-tight">{{ t('migrations.preview.issues.title') }}</h3>
      <p v-if="levels.length === 0" class="text-sm text-muted-foreground">{{ t('migrations.preview.issues.none') }}</p>
      <MigrationIssueLevel v-for="level in levels" :key="level" :migration-id="batch.id" :level="level" :total="totals[level]" />
    </section>

    <div class="grid gap-3 border-t pt-6">
      <p v-if="blocked" class="text-sm font-medium text-destructive" data-testid="migration-blocked">{{ t('migrations.preview.blocked') }}</p>
      <div class="flex flex-wrap justify-between gap-2">
        <Button as-child variant="outline"><NuxtLink to="/app/migrations">{{ t('migrations.preview.back') }}</NuxtLink></Button>
        <Button type="button" data-testid="migration-preview-next" @click="emit('next')">{{ t('migrations.preview.next') }}</Button>
      </div>
    </div>
  </section>
</template>
