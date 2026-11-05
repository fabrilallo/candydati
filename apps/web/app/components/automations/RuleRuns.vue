<script setup lang="ts">
import type { AutomationRunDto } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { listRuns } from '@/lib/automation-api'
import { relativeTime } from '@/lib/job-list-view'

/**
 * Read-only log of the latest runs of a saved rule: when, which kind of occurrence ran it, and a link to the
 * application. It lists what the rule did; it never scores or ranks anyone.
 */
const props = defineProps<{ jobId: string; ruleId: string }>()
const { t, locale } = useI18n()
const request = useJobsApi()
const runs = ref<readonly AutomationRunDto[] | null>(null)
const errorKey = ref<string | null>(null)
const now = new Date()

const hrefOf = (run: AutomationRunDto): string | null =>
  run.candidate ? `/app/candidates/${encodeURIComponent(run.candidate.id)}?application=${encodeURIComponent(run.applicationId)}&viaJobId=${encodeURIComponent(props.jobId)}` : null

onMounted(async () => {
  try {
    runs.value = await listRuns(request, props.ruleId)
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  }
})
</script>

<template>
  <section class="grid gap-3 rounded-xl bg-muted px-4 py-3.5" aria-labelledby="rule-runs-title" data-testid="rule-runs">
    <h3 id="rule-runs-title" class="text-sm font-medium">{{ t('automations.runs.title') }}</h3>
    <p class="text-xs text-muted-foreground">{{ t('automations.runs.readOnly') }}</p>
    <FormAlert v-if="errorKey" :message-key="errorKey" />
    <p v-else-if="runs === null" class="text-sm text-muted-foreground">{{ t('automations.runs.loading') }}</p>
    <p v-else-if="runs.length === 0" class="text-sm text-muted-foreground" data-testid="rule-runs-empty">{{ t('automations.runs.empty') }}</p>
    <ul v-else class="grid max-h-48 gap-1.5 overflow-y-auto text-sm" data-testid="rule-runs-list">
      <li v-for="run in runs" :key="run.id" class="flex flex-wrap items-baseline gap-x-2">
        <NuxtLink v-if="hrefOf(run)" :to="hrefOf(run)!" class="font-medium underline-offset-2 hover:underline">{{ run.candidate?.firstName }} {{ run.candidate?.lastName }}</NuxtLink>
        <span v-else class="font-medium">{{ t('automations.runs.application') }}</span>
        <span class="text-muted-foreground">{{ t(`automations.runs.kind.${run.trigger}`) }}</span>
        <time class="text-xs text-muted-foreground" :datetime="run.at">{{ relativeTime(run.at, now, locale) }}</time>
      </li>
    </ul>
  </section>
</template>
