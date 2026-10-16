<script setup lang="ts">
import type { PublicCareersDto, PublicJobSummaryDto } from '@candydati/domain'
import { careersStats, filterCareers, groupCareers, workModesOf } from '@/lib/careers-view'

/**
 * The open positions of the careers page (its `jobs` section): how many are open, a work-mode filter, the ads grouped by
 * role family, each with salary and the number of stages in evidence. Never the response time.
 */
const props = withDefaults(defineProps<{ careers: PublicCareersDto; title?: string; intro?: string; headingId?: string }>(), {
  title: '',
  intro: '',
  headingId: 'careers-positions-title',
})
const { t } = useI18n()
// Client-side only: filtering never touches the URL, so crawlers see one stable page.
const workMode = ref<PublicJobSummaryDto['workMode'] | null>(null)
const stats = computed(() => careersStats(props.careers.jobs))
const modes = computed(() => workModesOf(props.careers.jobs))
const visible = computed(() => filterCareers(props.careers.jobs, { workMode: workMode.value, family: null }))
const groups = computed(() => groupCareers(visible.value))
</script>

<template>
  <div class="grid gap-10">
    <header class="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-end">
      <div class="grid gap-3">
        <h2 :id="headingId" class="cp-heading cp-h2">{{ title || t('careersSite.jobs.title') }}</h2>
        <p v-if="intro" class="max-w-2xl text-lg text-muted-foreground text-pretty">{{ intro }}</p>
      </div>
      <dl v-if="stats.openCount > 0" class="grid gap-1" data-testid="careers-stats">
        <dt class="order-2 text-sm text-muted-foreground">{{ t('careers.stats.open', { count: stats.openCount }, stats.openCount) }}</dt>
        <dd class="figure text-6xl leading-none font-semibold tracking-tighter">{{ stats.openCount }}</dd>
      </dl>
    </header>

    <div v-if="careers.jobs.length" class="grid gap-8">
      <CareersWorkModeFilter v-if="modes.length > 1" :modes="modes" :total="careers.jobs.length" :selected="workMode" @select="workMode = $event" />
      <p class="sr-only" aria-live="polite">{{ t('careers.count', { count: visible.length }, visible.length) }}</p>
      <section v-for="group in groups" :key="group.family" :aria-labelledby="`family-${group.family}`" class="grid gap-1" data-testid="careers-group">
        <h3 :id="`family-${group.family}`" class="flex items-baseline gap-2 border-b pb-3 text-base font-semibold tracking-tight">
          {{ t(`taxonomy.roleFamilies.${group.family}`) }}
          <span class="figure text-sm font-normal text-muted-foreground">{{ group.jobs.length }}</span>
        </h3>
        <ul class="divide-y divide-border/70">
          <CareersJobCard v-for="job in group.jobs" :key="job.slug" :org-slug="careers.organization.slug" :job="job" />
        </ul>
      </section>
    </div>
    <section v-else class="grid gap-2 border-y py-14" data-testid="careers-empty">
      <h3 class="text-xl font-semibold tracking-tight">{{ t('careers.empty') }}</h3>
      <p class="max-w-md text-[0.9375rem] text-muted-foreground">{{ t('careers.emptyBody') }}</p>
    </section>
  </div>
</template>
