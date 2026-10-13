<script setup lang="ts">
import type { JobStatsDto } from '@tt/domain'
import { blockerLabel, type Blocker } from '@/lib/stats-view'

/**
 * Which publication rules (PRODUCT.md §4.1) keep drafts from going out: a ranked bar list, one bar per rule, scaled on the
 * number of drafts. The rules are the standard, so this shows where writers get stuck, not who is behind.
 */
const props = defineProps<{ readiness: JobStatsDto['readiness'] }>()
const { t } = useI18n()
const MAX_ROWS = 6
const rows = computed(() => props.readiness.blockers.slice(0, MAX_ROWS))
const label = (blocker: Blocker): string => {
  const view = blockerLabel(blocker)
  return view.fieldKey ? t(view.key, { field: t(view.fieldKey) }) : t(view.key)
}
const width = (drafts: number): string => `${Math.max(6, (drafts / Math.max(1, props.readiness.draftCount)) * 100)}%`
</script>

<template>
  <StatCard id="stat-readiness" :title="t('dashboard.stats.readiness.title')" :hint="readiness.draftCount > 0 ? t('dashboard.stats.readiness.hint', { ready: readiness.readyCount, total: readiness.draftCount }) : undefined">
    <ul v-if="rows.length > 0" class="grid gap-3.5">
      <li v-for="blocker in rows" :key="`${blocker.rule}-${blocker.path}`" class="grid gap-1.5" data-testid="blocker">
        <div class="flex items-baseline justify-between gap-3 text-sm">
          <span class="min-w-0 truncate">{{ label(blocker) }}</span>
          <span class="figure shrink-0 text-muted-foreground">{{ t('dashboard.stats.readiness.drafts', blocker.drafts) }}</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div class="h-full rounded-full bg-[var(--chart-neutral)]" :style="{ width: width(blocker.drafts) }" />
        </div>
      </li>
    </ul>
    <ChartEmpty
      v-else
      :title="readiness.draftCount > 0 ? t('dashboard.stats.readiness.allReadyTitle') : t('dashboard.stats.readiness.emptyTitle')"
      :body="readiness.draftCount > 0 ? t('dashboard.stats.readiness.allReadyBody') : t('dashboard.stats.readiness.emptyBody')"
    />
    <template v-if="readiness.draftCount > 0" #footer>
      <NuxtLink to="/app/jobs" class="text-sm font-medium text-primary underline-offset-4 hover:underline">{{ t('dashboard.stats.readiness.open') }}</NuxtLink>
    </template>
  </StatCard>
</template>
